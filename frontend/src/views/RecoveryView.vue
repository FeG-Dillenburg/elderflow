<script setup lang="ts">
import { onBeforeUnmount, reactive, ref } from "vue";
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
  verifyRecoveryCandidate,
  type RecoveryCandidate,
} from "../e2ee/crypto";
import { recoverySession } from "../e2ee/recovery-session";

const { t } = useI18n();
const router = useRouter();
const busy = ref(false);
const errorMessage = ref("");
const activeCeremonyId = ref<string | null>(null);
const started = ref<{ id: string; fingerprint: string; expiresAt: string } | null>(null);
const approved = ref(false);
const startForm = reactive({ recoverySecret: "", passphrase: "", confirmation: "" });
const approveForm = reactive({ ceremonyId: "", recoverySecret: "", passphrase: "" });

async function startRecovery(): Promise<void> {
  if (startForm.passphrase !== startForm.confirmation) {
    errorMessage.value = t("e2ee.passphrasesMismatch");
    return;
  }
  busy.value = true;
  errorMessage.value = "";
  try {
    const metadata = await api.e2eeRecoveryMetadata();
    const candidate = await createRecoveryCandidate(
      startForm.recoverySecret,
      startForm.passphrase,
      metadata,
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
  } catch {
    errorMessage.value = t("e2ee.recoveryFailed");
  } finally {
    busy.value = false;
  }
}

async function approveRecovery(): Promise<void> {
  busy.value = true;
  errorMessage.value = "";
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
      approveForm.recoverySecret,
      approveForm.passphrase,
      metadata,
      candidate,
    );
    if (!verified) throw new Error("candidate mismatch");
    await api.approveE2eeRecovery(ceremony.id, candidate.candidateFingerprint);
    activeCeremonyId.value = ceremony.id;
    recoverySession.set(ceremony.id);
    approved.value = true;
    clearSecrets(approveForm);
  } catch {
    errorMessage.value = t("e2ee.recoveryFailed");
  } finally {
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
  } catch {
    errorMessage.value = t("e2ee.recoveryFailed");
  } finally {
    busy.value = false;
  }
}

onBeforeUnmount(() => {
  if (activeCeremonyId.value) {
    void recoverySession.abort();
  }
  clearSecrets(startForm);
  clearSecrets(approveForm);
});

function clearSecrets(form: Record<string, string>): void {
  Object.keys(form).forEach((key) => {
    if (key !== "ceremonyId") form[key] = "";
  });
}
</script>

<template>
  <section class="recovery-page">
    <header>
      <p class="eyebrow">{{ t("e2ee.keyManagement") }}</p>
      <h1>{{ t("e2ee.recoveryTitle") }}</h1>
      <p>{{ t("e2ee.recoveryDescription") }}</p>
    </header>

    <Message v-if="errorMessage" severity="error" :closable="false" aria-live="polite">
      {{ errorMessage }}
    </Message>

    <div class="recovery-columns">
      <form class="recovery-card" @submit.prevent="startRecovery">
        <h2>{{ t("e2ee.startRecovery") }}</h2>
        <label>
          <span>{{ t("e2ee.recoverySecret") }}</span>
          <InputText v-model="startForm.recoverySecret" autocomplete="off" required />
        </label>
        <label>
          <span>{{ t("e2ee.newSharedPassphrase") }}</span>
          <Password v-model="startForm.passphrase" :feedback="false" autocomplete="new-password" required />
        </label>
        <label>
          <span>{{ t("e2ee.confirmSharedPassphrase") }}</span>
          <Password v-model="startForm.confirmation" :feedback="false" autocomplete="new-password" required />
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
          <InputText v-model="approveForm.recoverySecret" autocomplete="off" required />
        </label>
        <label>
          <span>{{ t("e2ee.newSharedPassphrase") }}</span>
          <Password v-model="approveForm.passphrase" :feedback="false" autocomplete="new-password" required />
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

@media (max-width: 760px) {
  .recovery-columns {
    grid-template-columns: 1fr;
  }
}
</style>
