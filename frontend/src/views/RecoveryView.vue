<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
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
import type {
  KeyCeremonyOperation,
  KeyCeremonyReasonCode,
} from "../e2ee/key-ceremony-payload";
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
const started = ref<{ id: string; expiresAt: string } | null>(null);
const approved = ref(false);
type ActiveCeremony = Awaited<ReturnType<typeof api.e2eeActiveKeyCeremony>>;
const activeCeremony = ref<ActiveCeremony>(null);
const activeCeremonyResolved = ref(false);
type KeySituation =
  | "lost-passphrase"
  | "routine-passphrase"
  | "routine-access-change"
  | "lost-recovery-secret"
  | "routine-recovery-secret"
  | "root-rotation"
  | "disclosed-passphrase"
  | "disclosed-recovery-secret"
  | "disclosed-encryption-key";
const selectedSituation = ref<KeySituation | null>(null);
const pageHeading = ref<HTMLElement | null>(null);
const preparedCandidate = ref<GeneratedKeyCeremonyCandidate | null>(null);
const custody = reactive({ firstCopy: "", secondCopy: "" });
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
interface OperationConfig {
  operation: KeyCeremonyOperation;
  reasonCode: KeyCeremonyReasonCode;
  currentPassphrase: boolean;
  currentRecovery: boolean;
  newPassphrase: boolean;
  newRecovery: boolean;
}

type ConfiguredKeySituation = Exclude<KeySituation, "lost-passphrase">;

const operationConfigs: Record<ConfiguredKeySituation, OperationConfig> = {
  "routine-passphrase": {
    operation: "change_passphrase",
    reasonCode: "team_member_left",
    currentPassphrase: true,
    currentRecovery: false,
    newPassphrase: true,
    newRecovery: false,
  },
  "routine-access-change": {
    operation: "change_passphrase",
    reasonCode: "routine_access_change",
    currentPassphrase: true,
    currentRecovery: false,
    newPassphrase: true,
    newRecovery: false,
  },
  "lost-recovery-secret": {
    operation: "replace_recovery_secret",
    reasonCode: "recovery_secret_lost",
    currentPassphrase: true,
    currentRecovery: false,
    newPassphrase: false,
    newRecovery: true,
  },
  "routine-recovery-secret": {
    operation: "replace_recovery_secret",
    reasonCode: "routine_custody_change",
    currentPassphrase: true,
    currentRecovery: false,
    newPassphrase: false,
    newRecovery: true,
  },
  "root-rotation": {
    operation: "rotate_root_key",
    reasonCode: "planned_root_rotation",
    currentPassphrase: true,
    currentRecovery: true,
    newPassphrase: false,
    newRecovery: false,
  },
  "disclosed-passphrase": {
    operation: "rotate_root_and_content_key",
    reasonCode: "passphrase_disclosed",
    currentPassphrase: false,
    currentRecovery: true,
    newPassphrase: true,
    newRecovery: true,
  },
  "disclosed-recovery-secret": {
    operation: "rotate_root_and_content_key",
    reasonCode: "recovery_secret_disclosed",
    currentPassphrase: true,
    currentRecovery: false,
    newPassphrase: true,
    newRecovery: true,
  },
  "disclosed-encryption-key": {
    operation: "rotate_root_and_content_key",
    reasonCode: "encryption_key_disclosed",
    currentPassphrase: true,
    currentRecovery: false,
    newPassphrase: true,
    newRecovery: true,
  },
};

const operationConfig = computed<OperationConfig | null>(() => {
  const situation = selectedSituation.value;
  if (!situation || situation === "lost-passphrase") return null;
  return operationConfigs[situation];
});
const showInitiatorPanel = computed(() => (
  !activeCeremony.value || activeCeremony.value.participantRole === "initiator"
));
const showApproverPanel = computed(() => (
  Boolean(activeCeremony.value)
  && activeCeremony.value?.participantRole !== "initiator"
  && (
    activeCeremony.value?.state === "pending_second_operator"
    || activeCeremony.value?.participantRole === "approver"
  )
));
const showCeremonyAlreadyAssigned = computed(() => (
  activeCeremony.value?.state === "ready_to_activate"
  && activeCeremony.value.participantRole === null
));
const startForm = reactive({ recoverySecret: "", passphrase: "", confirmation: "" });
const approveForm = reactive({ ceremonyId: "", recoverySecret: "", passphrase: "" });
let kdfAbort: AbortController | null = null;
let activeCeremonyPoll: ReturnType<typeof setInterval> | null = null;
let activeCeremonyRequestPending = false;

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
  if (config.newRecovery && (
    custody.firstCopy.trim() !== candidate.recoveryText
    || custody.secondCopy.trim() !== candidate.recoveryText
  )) {
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
      expiresAt: ceremony.expiresAt,
    };
    clearSecrets(genericStartForm);
    preparedCandidate.value = null;
    custody.firstCopy = "";
    custody.secondCopy = "";
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

async function selectSituation(situation: KeySituation): Promise<void> {
  selectedSituation.value = situation;
  await nextTick();
  pageHeading.value?.focus();
}

async function chooseDifferentSituation(): Promise<void> {
  selectedSituation.value = null;
  errorMessage.value = "";
  approved.value = false;
  preparedCandidate.value = null;
  clearSecrets(genericStartForm);
  clearSecrets(genericApproveForm);
  await nextTick();
  pageHeading.value?.focus();
}

async function refreshActiveCeremony(): Promise<void> {
  if (activeCeremonyRequestPending || busy.value) return;
  activeCeremonyRequestPending = true;
  try {
    const ceremony = await api.e2eeActiveKeyCeremony();
    if (!ceremony) {
      if (activeCeremony.value && !activeCeremonyId.value) {
        selectedSituation.value = null;
      }
      activeCeremony.value = null;
      return;
    }
    const situation = situationForReason(ceremony.reasonCode);
    if (!situation) return;
    activeCeremony.value = ceremony;
    selectedSituation.value = situation;
    if (ceremony.operation === "lost_passphrase") {
      approveForm.ceremonyId = ceremony.id;
    } else {
      genericApproveForm.ceremonyId = ceremony.id;
    }
    if (ceremony.participantRole) {
      activeCeremonyId.value = ceremony.id;
      recoverySession.set(ceremony.id);
    }
    if (ceremony.participantRole === "initiator") {
      started.value = { id: ceremony.id, expiresAt: ceremony.expiresAt };
    } else if (ceremony.participantRole === "approver") {
      approved.value = ceremony.state === "ready_to_activate";
    }
  } catch (error) {
    if (!activeCeremonyResolved.value) {
      errorMessage.value = recoveryFailureMessage(error);
    }
  } finally {
    activeCeremonyResolved.value = true;
    activeCeremonyRequestPending = false;
  }
}

onMounted(async () => {
  await refreshActiveCeremony();
  activeCeremonyPoll = setInterval(() => {
    void refreshActiveCeremony();
  }, 5_000);
});

onBeforeUnmount(() => {
  if (activeCeremonyPoll) clearInterval(activeCeremonyPoll);
  activeCeremonyPoll = null;
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

function situationForReason(reasonCode: KeyCeremonyReasonCode): KeySituation | null {
  if (reasonCode === "passphrase_lost") return "lost-passphrase";
  const entry = (Object.entries(operationConfigs) as Array<[
    ConfiguredKeySituation,
    OperationConfig,
  ]>).find(([, config]) => config.reasonCode === reasonCode);
  return entry?.[0] ?? null;
}
</script>

<template>
  <section class="recovery-page">
    <header>
      <p class="eyebrow">{{ t("e2ee.keyManagement") }}</p>
      <h1
        ref="pageHeading"
        tabindex="-1"
      >
        {{ selectedSituation ? t(`e2ee.keyOperationTitles.${selectedSituation}`) : t("e2ee.keySituationTitle") }}
      </h1>
      <p>{{ t("e2ee.recoveryDescription") }}</p>
    </header>

    <nav
      v-if="activeCeremonyResolved && !selectedSituation && !activeCeremony"
      class="situation-list"
      :aria-label="t('e2ee.keySituationAria')"
    >
      <button
        v-for="situation in ([
          'lost-passphrase',
          'routine-passphrase',
          'routine-access-change',
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
        @click="selectSituation(situation)"
      >
        {{ t(`e2ee.keySituations.${situation}`) }}
        <i class="pi pi-arrow-right" aria-hidden="true" />
      </button>
    </nav>

    <Button
      v-if="activeCeremonyResolved && selectedSituation && !activeCeremony && !activeCeremonyId && !started"
      class="back-action"
      type="button"
      severity="secondary"
      text
      icon="pi pi-arrow-left"
      :label="t('e2ee.chooseDifferentSituation')"
      @click="chooseDifferentSituation"
    />

    <Message
      v-if="errorMessage"
      severity="error"
      :closable="false"
      aria-live="polite"
    >
      {{ errorMessage }}
    </Message>

    <Message
      v-if="activeCeremonyResolved && showCeremonyAlreadyAssigned"
      severity="info"
      :closable="false"
      aria-live="polite"
    >
      {{ t("e2ee.ceremonyAlreadyAssigned") }}
    </Message>

    <div
      v-if="activeCeremonyResolved && selectedSituation === 'lost-passphrase'"
      class="recovery-columns"
    >
      <form
        v-if="showInitiatorPanel"
        class="recovery-card"
        @submit.prevent="startRecovery"
      >
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
        <Button
          type="submit"
          :label="t('e2ee.startRecovery')"
          :loading="busy"
        />
        <Message
          v-if="started"
          severity="info"
          :closable="false"
        >
          {{ t("e2ee.shareCeremony", { id: started.id }) }}
        </Message>
      </form>

      <form
        v-if="showApproverPanel"
        class="recovery-card"
        @submit.prevent="approveRecovery"
      >
        <h2>{{ t("e2ee.approveRecovery") }}</h2>
        <label>
          <span>{{ t("e2ee.ceremonyId") }}</span>
          <InputText
            v-model="approveForm.ceremonyId"
            autocomplete="off"
            required
          />
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
        <Button
          type="submit"
          :label="t('e2ee.verifyAndApprove')"
          :loading="busy"
        />
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

    <div
      v-else-if="activeCeremonyResolved && operationConfig"
      class="recovery-columns"
    >
      <form
        v-if="showInitiatorPanel"
        class="recovery-card"
        @submit.prevent="preparedCandidate ? startPreparedCeremony() : prepareKeyCeremony()"
      >
        <h2>{{ t("e2ee.startCeremony") }}</h2>
        <label v-if="operationConfig.currentPassphrase">
          <span>{{ t("e2ee.currentSharedPassphrase") }}</span>
          <Password
            v-model="genericStartForm.currentPassphrase"
            :feedback="false"
            autocomplete="current-password"
            required
          />
        </label>
        <label v-if="operationConfig.currentRecovery">
          <span>{{ t("e2ee.currentRecoverySecret") }}</span>
          <InputText
            v-model="genericStartForm.currentRecoveryText"
            autocomplete="off"
            required
          />
        </label>
        <label v-if="operationConfig.newPassphrase">
          <span>{{ t("e2ee.newSharedPassphrase") }}</span>
          <Password
            v-model="genericStartForm.newPassphrase"
            :feedback="false"
            autocomplete="new-password"
            required
            :minlength="SHARED_PASSPHRASE_MIN_LENGTH"
          />
        </label>
        <label v-if="operationConfig.newPassphrase">
          <span>{{ t("e2ee.confirmSharedPassphrase") }}</span>
          <Password
            v-model="genericStartForm.confirmation"
            :feedback="false"
            autocomplete="new-password"
            required
            :minlength="SHARED_PASSPHRASE_MIN_LENGTH"
          />
        </label>
        <template v-if="preparedCandidate?.recoveryText">
          <Message
            severity="warn"
            :closable="false"
          >
            {{ t("e2ee.recoveryWarning") }}
          </Message>
          <code class="recovery-secret">{{ preparedCandidate.recoveryText }}</code>
          <Button
            type="button"
            icon="pi pi-print"
            :label="t('e2ee.printRecoverySecret')"
            @click="printRecoverySecret"
          />
          <label>
            <span>{{ t("e2ee.custodyCopyOne") }}</span>
            <InputText
              v-model="custody.firstCopy"
              autocomplete="off"
              required
            />
          </label>
          <label>
            <span>{{ t("e2ee.custodyCopyTwo") }}</span>
            <InputText
              v-model="custody.secondCopy"
              autocomplete="off"
              required
            />
          </label>
        </template>
        <Button
          type="submit"
          :label="preparedCandidate ? t('e2ee.startCeremony') : t('e2ee.prepareCandidate')"
          :loading="busy"
        />
        <Message
          v-if="started"
          severity="info"
          :closable="false"
        >
          {{ t("e2ee.shareCeremony", { id: started.id }) }}
        </Message>
      </form>

      <form
        v-if="showApproverPanel"
        class="recovery-card"
        @submit.prevent="approveKeyCeremony"
      >
        <h2>{{ t("e2ee.approveRecovery") }}</h2>
        <label>
          <span>{{ t("e2ee.ceremonyId") }}</span>
          <InputText
            v-model="genericApproveForm.ceremonyId"
            autocomplete="off"
            required
          />
        </label>
        <label v-if="operationConfig.currentPassphrase">
          <span>{{ t("e2ee.currentSharedPassphrase") }}</span>
          <Password
            v-model="genericApproveForm.currentPassphrase"
            :feedback="false"
            autocomplete="current-password"
            required
          />
        </label>
        <label v-if="operationConfig.currentRecovery">
          <span>{{ t("e2ee.currentRecoverySecret") }}</span>
          <InputText
            v-model="genericApproveForm.currentRecoveryText"
            autocomplete="off"
            required
          />
        </label>
        <label v-if="operationConfig.newPassphrase">
          <span>{{ t("e2ee.candidateSharedPassphrase") }}</span>
          <Password
            v-model="genericApproveForm.newPassphrase"
            :feedback="false"
            autocomplete="new-password"
            required
            :minlength="SHARED_PASSPHRASE_MIN_LENGTH"
          />
        </label>
        <label v-if="operationConfig.newRecovery">
          <span>{{ t("e2ee.candidateRecoverySecret") }}</span>
          <InputText
            v-model="genericApproveForm.candidateRecoveryText"
            autocomplete="off"
            required
          />
        </label>
        <Button
          type="submit"
          :label="t('e2ee.verifyAndApprove')"
          :loading="busy"
        />
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
  margin: 0 0 0.3rem;
  color: #607dae;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

h1,
h2 {
  margin: 0.25rem 0;
}

.recovery-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
  max-width: 48rem;
}

.situation-list {
  display: grid;
  gap: 0.75rem;
}

.back-action {
  justify-self: start;
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
