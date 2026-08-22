<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Password from "primevue/password";
import { useI18n } from "vue-i18n";
import { api } from "../api/domain";
import { auth } from "../auth/auth";
import {
  createRecoveryCandidate,
  createKeyCeremonyCandidate,
  verifyRecoveryCandidate,
  verifyKeyCeremonyCandidate,
  type GeneratedKeyCeremonyCandidate,
  type RecoveryCandidate,
} from "../e2ee/crypto";
import { recoverySession } from "../e2ee/recovery-session";
import {
  isSharedPassphraseValid,
  SHARED_PASSPHRASE_MIN_LENGTH,
} from "../e2ee/shared-passphrase-policy";

const { t } = useI18n();
const router = useRouter();
const busy = ref(false);
const errorMessage = ref("");
const startRecoverySecretError = ref("");
const approveRecoverySecretError = ref("");
const startPassphraseError = ref("");
const approvePassphraseError = ref("");
const activeCeremonyId = ref<string | null>(null);
const started = ref<{ id: string; fingerprint: string; expiresAt: string } | null>(null);
const approved = ref(false);
type KeySituation =
  | "lost-passphrase"
  | "routine-passphrase"
  | "lost-recovery-secret"
  | "routine-recovery-secret"
  | "root-rotation"
  | "disclosed-passphrase"
  | "disclosed-recovery-secret"
  | "disclosed-encryption-key";
const selectedSituation = ref<KeySituation | null>(null);
const preparedCandidate = ref<GeneratedKeyCeremonyCandidate | null>(null);
const custody = reactive({ first: false, second: false });
const genericStartForm = reactive({
  currentPassphrase: "",
  currentRecoveryText: "",
  newPassphrase: "",
  confirmation: "",
});
const genericApproveForm = reactive({
  ceremonyId: "",
  currentPassphrase: "",
  currentRecoveryText: "",
  newPassphrase: "",
  candidateRecoveryText: "",
});
const operationConfig = computed(() => {
  switch (selectedSituation.value) {
    case "routine-passphrase":
      return { operation: "change_passphrase" as const, reasonCode: "team_member_left", currentPassphrase: true, currentRecovery: false, newPassphrase: true, newRecovery: false };
    case "lost-recovery-secret":
      return { operation: "replace_recovery_secret" as const, reasonCode: "recovery_secret_lost", currentPassphrase: true, currentRecovery: false, newPassphrase: false, newRecovery: true };
    case "routine-recovery-secret":
      return { operation: "replace_recovery_secret" as const, reasonCode: "routine_custody_change", currentPassphrase: true, currentRecovery: false, newPassphrase: false, newRecovery: true };
    case "root-rotation":
      return { operation: "rotate_root_key" as const, reasonCode: "planned_root_rotation", currentPassphrase: true, currentRecovery: true, newPassphrase: false, newRecovery: false };
    case "disclosed-passphrase":
      return { operation: "rotate_root_and_content_key" as const, reasonCode: "passphrase_disclosed", currentPassphrase: false, currentRecovery: true, newPassphrase: true, newRecovery: true };
    case "disclosed-recovery-secret":
      return { operation: "rotate_root_and_content_key" as const, reasonCode: "recovery_secret_disclosed", currentPassphrase: true, currentRecovery: false, newPassphrase: true, newRecovery: true };
    case "disclosed-encryption-key":
      return { operation: "rotate_root_and_content_key" as const, reasonCode: "encryption_key_disclosed", currentPassphrase: true, currentRecovery: false, newPassphrase: true, newRecovery: true };
    default:
      return null;
  }
});
const startForm = reactive({ recoverySecret: "", passphrase: "", confirmation: "" });
const approveForm = reactive({ ceremonyId: "", recoverySecret: "", passphrase: "" });
let kdfAbort: AbortController | null = null;

async function startRecovery(): Promise<void> {
  selectedSituation.value ??= "lost-passphrase";
  startPassphraseError.value = "";
  if (!isSharedPassphraseValid(startForm.passphrase)) {
    startPassphraseError.value = t("e2ee.sharedPassphraseLength");
    errorMessage.value = startPassphraseError.value;
    return;
  }
  if (startForm.passphrase !== startForm.confirmation) {
    errorMessage.value = t("e2ee.passphrasesMismatch");
    return;
  }
  busy.value = true;
  errorMessage.value = "";
  startRecoverySecretError.value = "";
  kdfAbort?.abort();
  kdfAbort = new AbortController();
  try {
    const metadata = await api.e2eeRecoveryMetadata();
    const candidate = await createRecoveryCandidate(
      startForm.recoverySecret.trim(),
      startForm.passphrase,
      metadata,
      kdfAbort.signal,
    );
    const ceremony = await api.startE2eeRecovery({
      expectedGeneration: metadata.generation,
      ...candidate,
    });
    activeCeremonyId.value = ceremony.id;
    recoverySession.set(ceremony.id);
    started.value = {
      id: ceremony.id,
      fingerprint: candidate.candidateFingerprint,
      expiresAt: ceremony.expiresAt,
    };
    clearSecrets(startForm);
  } catch (error) {
    if (isRecoverySecretFailure(error)) {
      startRecoverySecretError.value = t("e2ee.recoverySecretInvalid");
      errorMessage.value = startRecoverySecretError.value;
    } else {
      errorMessage.value = recoveryFailureMessage(error);
    }
  } finally {
    kdfAbort = null;
    busy.value = false;
  }
}

async function approveRecovery(): Promise<void> {
  selectedSituation.value ??= "lost-passphrase";
  approvePassphraseError.value = "";
  if (!isSharedPassphraseValid(approveForm.passphrase)) {
    approvePassphraseError.value = t("e2ee.sharedPassphraseLength");
    errorMessage.value = approvePassphraseError.value;
    return;
  }
  busy.value = true;
  errorMessage.value = "";
  approveRecoverySecretError.value = "";
  kdfAbort?.abort();
  kdfAbort = new AbortController();
  try {
    const [metadata, ceremony] = await Promise.all([
      api.e2eeRecoveryMetadata(),
      api.e2eeRecoveryCeremony(approveForm.ceremonyId),
    ]);
    const candidate: RecoveryCandidate = {
      candidateFingerprint: ceremony.candidateFingerprint,
      candidateSharedPassphraseSlot: ceremony.candidateSharedPassphraseSlot,
    };
    const verified = await verifyRecoveryCandidate(
      approveForm.recoverySecret.trim(),
      approveForm.passphrase,
      metadata,
      candidate,
      kdfAbort.signal,
    );
    if (!verified) {
      errorMessage.value = t("e2ee.recoveryCandidateMismatch");
      return;
    }
    await api.approveE2eeRecovery(ceremony.id, candidate.candidateFingerprint);
    activeCeremonyId.value = ceremony.id;
    recoverySession.set(ceremony.id);
    approved.value = true;
    clearSecrets(approveForm);
  } catch (error) {
    if (isRecoverySecretFailure(error)) {
      approveRecoverySecretError.value = t("e2ee.recoverySecretInvalid");
      errorMessage.value = approveRecoverySecretError.value;
    } else {
      errorMessage.value = recoveryFailureMessage(error);
    }
  } finally {
    kdfAbort = null;
    busy.value = false;
  }
}

async function activateRecovery(): Promise<void> {
  if (!activeCeremonyId.value) return;
  busy.value = true;
  try {
    await api.activateE2eeRecovery(activeCeremonyId.value);
    activeCeremonyId.value = null;
    recoverySession.clear();
    auth.logout();
    await router.push("/login");
  } catch (error) {
    errorMessage.value = recoveryFailureMessage(error);
  } finally {
    busy.value = false;
  }
}

async function prepareKeyCeremony(): Promise<void> {
  const config = operationConfig.value;
  if (!config) return;
  if (config.newPassphrase && !isSharedPassphraseValid(genericStartForm.newPassphrase)) {
    errorMessage.value = t("e2ee.sharedPassphraseLength");
    return;
  }
  if (config.newPassphrase && genericStartForm.newPassphrase !== genericStartForm.confirmation) {
    errorMessage.value = t("e2ee.passphrasesMismatch");
    return;
  }
  busy.value = true;
  errorMessage.value = "";
  kdfAbort?.abort();
  kdfAbort = new AbortController();
  try {
    const metadata = await api.e2eeRecoveryMetadata();
    preparedCandidate.value = await createKeyCeremonyCandidate({
      operation: config.operation,
      reasonCode: config.reasonCode,
      state: metadata,
      ...(config.currentPassphrase ? { currentPassphrase: genericStartForm.currentPassphrase } : {}),
      ...(config.currentRecovery ? { currentRecoveryText: genericStartForm.currentRecoveryText.trim() } : {}),
      ...(config.newPassphrase ? { newPassphrase: genericStartForm.newPassphrase } : {}),
    }, kdfAbort.signal);
  } catch (error) {
    errorMessage.value = recoveryFailureMessage(error);
  } finally {
    kdfAbort = null;
    busy.value = false;
  }
}

async function startPreparedCeremony(): Promise<void> {
  const candidate = preparedCandidate.value;
  const config = operationConfig.value;
  if (!candidate || !config) return;
  if (config.newRecovery && (!custody.first || !custody.second)) {
    errorMessage.value = t("e2ee.custodyCopiesRequired");
    return;
  }
  busy.value = true;
  errorMessage.value = "";
  try {
    const ceremony = await api.startE2eeKeyCeremony(candidate.encodedCandidate);
    activeCeremonyId.value = ceremony.id;
    recoverySession.set(ceremony.id);
    started.value = {
      id: ceremony.id,
      fingerprint: ceremony.candidateFingerprint,
      expiresAt: ceremony.expiresAt,
    };
    clearSecrets(genericStartForm);
    preparedCandidate.value = null;
    custody.first = false;
    custody.second = false;
  } catch (error) {
    errorMessage.value = recoveryFailureMessage(error);
  } finally {
    busy.value = false;
  }
}

async function approveKeyCeremony(): Promise<void> {
  const config = operationConfig.value;
  if (!config) return;
  if (config.newPassphrase && !isSharedPassphraseValid(genericApproveForm.newPassphrase)) {
    errorMessage.value = t("e2ee.sharedPassphraseLength");
    return;
  }
  busy.value = true;
  errorMessage.value = "";
  kdfAbort?.abort();
  kdfAbort = new AbortController();
  try {
    const [metadata, ceremony] = await Promise.all([
      api.e2eeRecoveryMetadata(),
      api.e2eeKeyCeremony(genericApproveForm.ceremonyId),
    ]);
    if (ceremony.operation !== config.operation) throw new Error("E2EE_CANDIDATE_MISMATCH");
    const verified = await verifyKeyCeremonyCandidate(
      ceremony.encodedCandidate,
      ceremony.candidateFingerprint,
      metadata,
      {
        ...(config.currentPassphrase ? { currentPassphrase: genericApproveForm.currentPassphrase } : {}),
        ...(config.currentRecovery ? { currentRecoveryText: genericApproveForm.currentRecoveryText.trim() } : {}),
        candidatePassphrase: config.newPassphrase
          ? genericApproveForm.newPassphrase
          : genericApproveForm.currentPassphrase,
        ...(config.newRecovery
          ? { candidateRecoveryText: genericApproveForm.candidateRecoveryText.trim() }
          : config.currentRecovery
            ? { candidateRecoveryText: genericApproveForm.currentRecoveryText.trim() }
            : {}),
      },
      kdfAbort.signal,
    );
    if (!verified) throw new Error("E2EE_CANDIDATE_MISMATCH");
    await api.approveE2eeKeyCeremony(ceremony.id, ceremony.candidateFingerprint);
    activeCeremonyId.value = ceremony.id;
    recoverySession.set(ceremony.id);
    approved.value = true;
    clearSecrets(genericApproveForm);
  } catch (error) {
    errorMessage.value = recoveryFailureMessage(error);
  } finally {
    kdfAbort = null;
    busy.value = false;
  }
}

async function activateKeyCeremony(): Promise<void> {
  if (!activeCeremonyId.value) return;
  busy.value = true;
  try {
    await api.activateE2eeKeyCeremony(activeCeremonyId.value);
    activeCeremonyId.value = null;
    recoverySession.clear();
    auth.logout();
    await router.push("/login");
  } catch (error) {
    errorMessage.value = recoveryFailureMessage(error);
  } finally {
    busy.value = false;
  }
}

function printRecoverySecret(): void {
  window.print();
}

onBeforeUnmount(() => {
  kdfAbort?.abort();
  kdfAbort = null;
  if (activeCeremonyId.value) {
    void recoverySession.abort();
  }
  clearSecrets(startForm);
  clearSecrets(approveForm);
  clearSecrets(genericStartForm);
  clearSecrets(genericApproveForm);
  preparedCandidate.value = null;
});

function clearSecrets(form: Record<string, string>): void {
  Object.keys(form).forEach((key) => {
    if (key !== "ceremonyId") form[key] = "";
  });
}

function isRecoverySecretFailure(error: unknown): boolean {
  return error instanceof Error && error.message === "E2EE_RECOVERY_FAILED";
}

function recoveryFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message && !error.message.startsWith("E2EE_")) {
    return error.message;
  }
  return t("e2ee.recoveryFailed");
}
</script>

<template>
  <section class="recovery-page">
    <header>
      <p class="eyebrow">{{ t("e2ee.keyManagement") }}</p>
      <h1>{{ selectedSituation ? t(`e2ee.keyOperationTitles.${selectedSituation}`) : t("e2ee.keySituationTitle") }}</h1>
      <p>{{ t("e2ee.recoveryDescription") }}</p>
    </header>

    <nav
      v-if="!selectedSituation"
      class="situation-list"
      :aria-label="t('e2ee.keySituationAria')"
    >
      <button
        v-for="situation in ([
          'lost-passphrase',
          'routine-passphrase',
          'lost-recovery-secret',
          'routine-recovery-secret',
          'root-rotation',
          'disclosed-passphrase',
          'disclosed-recovery-secret',
          'disclosed-encryption-key',
        ] as KeySituation[])"
        :key="situation"
        type="button"
        class="situation-card"
        :data-situation="situation"
        @click="selectedSituation = situation"
      >
        {{ t(`e2ee.keySituations.${situation}`) }}
        <i class="pi pi-arrow-right" aria-hidden="true" />
      </button>
    </nav>

    <Message v-if="errorMessage" severity="error" :closable="false" aria-live="polite">
      {{ errorMessage }}
    </Message>

    <div v-if="selectedSituation === 'lost-passphrase'" class="recovery-columns">
      <form class="recovery-card" @submit.prevent="startRecovery">
        <h2>{{ t("e2ee.startRecovery") }}</h2>
        <label>
          <span>{{ t("e2ee.recoverySecret") }}</span>
          <InputText
            v-model="startForm.recoverySecret"
            autocomplete="off"
            required
            :invalid="Boolean(startRecoverySecretError)"
            :aria-describedby="startRecoverySecretError ? 'start-recovery-secret-error' : undefined"
            @update:model-value="startRecoverySecretError = ''"
          />
          <small
            v-if="startRecoverySecretError"
            id="start-recovery-secret-error"
            class="field-error"
          >
            {{ startRecoverySecretError }}
          </small>
        </label>
        <label>
          <span>{{ t("e2ee.newSharedPassphrase") }}</span>
          <Password
            v-model="startForm.passphrase"
            :feedback="false"
            autocomplete="new-password"
            required
            :minlength="SHARED_PASSPHRASE_MIN_LENGTH"
            :invalid="Boolean(startPassphraseError)"
            :aria-describedby="startPassphraseError ? 'start-passphrase-error' : undefined"
            @update:model-value="startPassphraseError = ''"
          />
          <small
            v-if="startPassphraseError"
            id="start-passphrase-error"
            class="field-error"
          >
            {{ startPassphraseError }}
          </small>
        </label>
        <label>
          <span>{{ t("e2ee.confirmSharedPassphrase") }}</span>
          <Password
            v-model="startForm.confirmation"
            :feedback="false"
            autocomplete="new-password"
            required
            :minlength="SHARED_PASSPHRASE_MIN_LENGTH"
          />
        </label>
        <Button type="submit" :label="t('e2ee.startRecovery')" :loading="busy" />
        <Message v-if="started" severity="info" :closable="false">
          {{ t("e2ee.shareCeremony", { id: started.id, fingerprint: started.fingerprint }) }}
        </Message>
      </form>

      <form class="recovery-card" @submit.prevent="approveRecovery">
        <h2>{{ t("e2ee.approveRecovery") }}</h2>
        <label>
          <span>{{ t("e2ee.ceremonyId") }}</span>
          <InputText v-model="approveForm.ceremonyId" autocomplete="off" required />
        </label>
        <label>
          <span>{{ t("e2ee.recoverySecret") }}</span>
          <InputText
            v-model="approveForm.recoverySecret"
            autocomplete="off"
            required
            :invalid="Boolean(approveRecoverySecretError)"
            :aria-describedby="approveRecoverySecretError ? 'approve-recovery-secret-error' : undefined"
            @update:model-value="approveRecoverySecretError = ''"
          />
          <small
            v-if="approveRecoverySecretError"
            id="approve-recovery-secret-error"
            class="field-error"
          >
            {{ approveRecoverySecretError }}
          </small>
        </label>
        <label>
          <span>{{ t("e2ee.newSharedPassphrase") }}</span>
          <Password
            v-model="approveForm.passphrase"
            :feedback="false"
            autocomplete="new-password"
            required
            :minlength="SHARED_PASSPHRASE_MIN_LENGTH"
            :invalid="Boolean(approvePassphraseError)"
            :aria-describedby="approvePassphraseError ? 'approve-passphrase-error' : undefined"
            @update:model-value="approvePassphraseError = ''"
          />
          <small
            v-if="approvePassphraseError"
            id="approve-passphrase-error"
            class="field-error"
          >
            {{ approvePassphraseError }}
          </small>
        </label>
        <Button type="submit" :label="t('e2ee.verifyAndApprove')" :loading="busy" />
        <Button
          v-if="approved"
          type="button"
          severity="danger"
          :label="t('e2ee.activateRecovery')"
          :loading="busy"
          @click="activateRecovery"
        />
      </form>
    </div>

    <div v-else-if="operationConfig" class="recovery-columns">
      <form class="recovery-card" @submit.prevent="preparedCandidate ? startPreparedCeremony() : prepareKeyCeremony()">
        <h2>{{ t("e2ee.startCeremony") }}</h2>
        <label v-if="operationConfig.currentPassphrase">
          <span>{{ t("e2ee.currentSharedPassphrase") }}</span>
          <Password v-model="genericStartForm.currentPassphrase" :feedback="false" autocomplete="current-password" required />
        </label>
        <label v-if="operationConfig.currentRecovery">
          <span>{{ t("e2ee.currentRecoverySecret") }}</span>
          <InputText v-model="genericStartForm.currentRecoveryText" autocomplete="off" required />
        </label>
        <label v-if="operationConfig.newPassphrase">
          <span>{{ t("e2ee.newSharedPassphrase") }}</span>
          <Password v-model="genericStartForm.newPassphrase" :feedback="false" autocomplete="new-password" required :minlength="SHARED_PASSPHRASE_MIN_LENGTH" />
        </label>
        <label v-if="operationConfig.newPassphrase">
          <span>{{ t("e2ee.confirmSharedPassphrase") }}</span>
          <Password v-model="genericStartForm.confirmation" :feedback="false" autocomplete="new-password" required :minlength="SHARED_PASSPHRASE_MIN_LENGTH" />
        </label>
        <template v-if="preparedCandidate?.recoveryText">
          <Message severity="warn" :closable="false">{{ t("e2ee.recoveryWarning") }}</Message>
          <code class="recovery-secret">{{ preparedCandidate.recoveryText }}</code>
          <Button type="button" icon="pi pi-print" :label="t('e2ee.printRecoverySecret')" @click="printRecoverySecret" />
          <label class="custody-check"><input v-model="custody.first" type="checkbox" /> {{ t("e2ee.custodyCopyOne") }}</label>
          <label class="custody-check"><input v-model="custody.second" type="checkbox" /> {{ t("e2ee.custodyCopyTwo") }}</label>
        </template>
        <Button
          type="submit"
          :label="preparedCandidate ? t('e2ee.startCeremony') : t('e2ee.prepareCandidate')"
          :loading="busy"
        />
        <Message v-if="started" severity="info" :closable="false">
          {{ t("e2ee.shareCeremony", { id: started.id, fingerprint: started.fingerprint }) }}
        </Message>
      </form>

      <form class="recovery-card" @submit.prevent="approveKeyCeremony">
        <h2>{{ t("e2ee.approveRecovery") }}</h2>
        <label>
          <span>{{ t("e2ee.ceremonyId") }}</span>
          <InputText v-model="genericApproveForm.ceremonyId" autocomplete="off" required />
        </label>
        <label v-if="operationConfig.currentPassphrase">
          <span>{{ t("e2ee.currentSharedPassphrase") }}</span>
          <Password v-model="genericApproveForm.currentPassphrase" :feedback="false" autocomplete="current-password" required />
        </label>
        <label v-if="operationConfig.currentRecovery">
          <span>{{ t("e2ee.currentRecoverySecret") }}</span>
          <InputText v-model="genericApproveForm.currentRecoveryText" autocomplete="off" required />
        </label>
        <label v-if="operationConfig.newPassphrase">
          <span>{{ t("e2ee.candidateSharedPassphrase") }}</span>
          <Password v-model="genericApproveForm.newPassphrase" :feedback="false" autocomplete="new-password" required :minlength="SHARED_PASSPHRASE_MIN_LENGTH" />
        </label>
        <label v-if="operationConfig.newRecovery">
          <span>{{ t("e2ee.candidateRecoverySecret") }}</span>
          <InputText v-model="genericApproveForm.candidateRecoveryText" autocomplete="off" required />
        </label>
        <Button type="submit" :label="t('e2ee.verifyAndApprove')" :loading="busy" />
        <Button
          v-if="approved"
          type="button"
          severity="danger"
          :label="t('e2ee.activateRecovery')"
          :loading="busy"
          @click="activateKeyCeremony"
        />
      </form>
    </div>
  </section>
</template>

<style scoped>
.recovery-page {
  display: grid;
  gap: 1.25rem;
}

.eyebrow {
  margin: 0;
  color: #64748b;
  font-weight: 700;
  text-transform: uppercase;
}

h1,
h2 {
  margin: 0.25rem 0;
}

.recovery-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.situation-list {
  display: grid;
  gap: 0.75rem;
}

.situation-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
  padding: 1rem 1.25rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.75rem;
  background: #fff;
  color: #0f172a;
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.situation-card:hover,
.situation-card:focus-visible {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px #bfdbfe;
  outline: none;
}

.recovery-card,
.recovery-card label {
  display: grid;
  gap: 0.5rem;
}

.recovery-card {
  align-content: start;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  background: #fff;
}

:deep(.p-password),
:deep(.p-password-input) {
  width: 100%;
}

.field-error {
  color: #b91c1c;
  font-size: 0.85rem;
}

@media (max-width: 760px) {
  .recovery-columns {
    grid-template-columns: 1fr;
  }
}
</style>
