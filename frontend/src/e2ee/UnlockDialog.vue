<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Password from "primevue/password";
import { useI18n } from "vue-i18n";
import router from "../router";
import { protectedText } from "./protected-text";

const passphrase = ref("");
const input = ref<{ $el?: HTMLElement } | null>(null);
const { t } = useI18n();
const dialogPassThrough = {
  mask: { class: "unlock-dialog-mask" },
  root: {
    "aria-labelledby": "protected-text-unlock-title",
    "aria-describedby": "protected-text-unlock-description",
  },
};

watch(
  () => protectedText.state.promptVisible,
  async (visible) => {
    if (!visible) passphrase.value = "";
    else {
      await nextTick();
      input.value?.$el?.querySelector("input")?.focus();
    }
  },
  { immediate: true },
);

async function unlock(): Promise<void> {
  await protectedText.unlock(passphrase.value);
  if (protectedText.state.error) {
    passphrase.value = "";
    await nextTick();
    input.value?.$el?.querySelector("input")?.focus();
  }
}

async function openRecovery(): Promise<void> {
  protectedText.skip();
  await router.push("/key-recovery");
}
</script>

<template>
  <Dialog
    :visible="protectedText.state.promptVisible"
    modal
    :closable="false"
    :show-header="false"
    :pt="dialogPassThrough"
    class="unlock-dialog"
  >
    <span class="unlock-icon" aria-hidden="true">
      <i class="pi pi-shield" />
    </span>
    <p class="unlock-eyebrow">{{ t("e2ee.unlockEyebrow") }}</p>
    <h2 id="protected-text-unlock-title">
      {{ t("e2ee.unlockTitle") }}
    </h2>
    <p id="protected-text-unlock-description" class="unlock-description">
      {{ t("e2ee.unlockDescription") }}
    </p>
    <form class="unlock-form" @submit.prevent="unlock">
      <label for="protected-text-passphrase">
        <span class="field-label">{{ t("e2ee.unlockPassphraseLabel") }}</span>
        <Password
          ref="input"
          v-model="passphrase"
          input-id="protected-text-passphrase"
          :placeholder="t('e2ee.unlockPassphrasePlaceholder')"
          :feedback="false"
          toggle-mask
          autocomplete="off"
          :disabled="protectedText.state.status === 'unlocking'"
          required
        />
      </label>
      <Message
        v-if="protectedText.state.error"
        severity="error"
        :closable="false"
        class="unlock-error"
        role="alert"
        aria-live="polite"
      >
        {{ t("e2ee.unlockFailed") }}
      </Message>
      <Button
        type="submit"
        class="unlock-submit"
        icon="pi pi-lock-open"
        :label="t('e2ee.unlockSubmit')"
        :loading="protectedText.state.status === 'unlocking'"
        :disabled="protectedText.state.status === 'unlocking'"
      />
      <Button
        type="button"
        class="recovery-button"
        severity="secondary"
        text
        :label="t('e2ee.unknownPassphrase')"
        :disabled="protectedText.state.status === 'unlocking'"
        @click="openRecovery"
      />
    </form>
    <button
      class="continue-button"
      type="button"
      :disabled="protectedText.state.status === 'unlocking'"
      @click="protectedText.skip()"
    >
      {{ t("e2ee.continueLocked") }}
    </button>
    <p class="security-boundary">
      <i class="pi pi-info-circle" aria-hidden="true" />
      <span>{{ t("e2ee.unlockBoundary") }}</span>
    </p>
  </Dialog>
</template>

<style scoped>
.unlock-icon {
  display: grid;
  width: 3rem;
  height: 3rem;
  margin-bottom: 1rem;
  place-items: center;
  border-radius: 0.8rem;
  background: #eaf1fb;
  color: #315f9f;
  font-size: 1.35rem;
}

.unlock-eyebrow {
  margin: 0 0 0.35rem;
  color: #5f6f85;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  color: #243047;
  font-size: 1.55rem;
  line-height: 1.2;
}

.unlock-description {
  margin: 0.7rem 0 0;
  color: #59677a;
  line-height: 1.55;
}

.unlock-form,
.unlock-form label {
  display: grid;
  gap: 0.4rem;
}

.unlock-form {
  gap: 0.75rem;
  margin-top: 1.25rem;
}

.field-label {
  color: #36445a;
  font-size: 0.8rem;
  font-weight: 750;
}

.unlock-error {
  margin: 0;
}

.unlock-submit {
  width: 100%;
  margin-top: 0.15rem;
}

.recovery-button {
  justify-self: start;
  padding-inline: 0;
  font-size: 0.8rem;
}

.continue-button {
  padding: 0;
  border: 0;
  background: transparent;
  color: #526985;
  cursor: pointer;
  font: inherit;
  font-size: 0.84rem;
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 0.2rem;
}

.continue-button:hover,
.continue-button:focus-visible {
  color: #315f9f;
  text-decoration-color: currentcolor;
}

.continue-button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.security-boundary {
  display: flex;
  gap: 0.45rem;
  margin: 1rem 0 0;
  padding-top: 0.9rem;
  border-top: 1px solid #e4e8ef;
  color: #69778b;
  font-size: 0.72rem;
  line-height: 1.45;
}

:deep(.p-password),
:deep(.p-password-input) {
  width: 100%;
}

:deep(.p-password-input:focus) {
  border-color: #3b6bb3;
  box-shadow: 0 0 0 3px rgb(59 107 179 / 15%);
}

:global(.unlock-dialog) {
  width: min(31rem, calc(100vw - 2rem));
  overflow: hidden;
  border: 0;
  border-radius: 1rem;
  box-shadow: 0 26px 80px rgb(15 23 42 / 30%);
}

:global(.unlock-dialog-mask) {
  padding: 1rem;
  background: rgb(24 37 60 / 42%);
  backdrop-filter: blur(2px);
}

:global(.unlock-dialog .p-dialog-content) {
  padding: 2rem;
  border-radius: inherit;
  background: #fff;
}

@media (max-width: 520px) {
  :global(.unlock-dialog) {
    width: calc(100vw - 2rem);
  }

  :global(.unlock-dialog-mask) {
    align-items: flex-start;
  }

  :global(.unlock-dialog .p-dialog-content) {
    padding: 1.3rem;
  }
}
</style>
