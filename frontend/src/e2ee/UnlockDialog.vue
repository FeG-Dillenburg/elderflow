<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Password from "primevue/password";
import { useI18n } from "vue-i18n";
import { protectedText } from "./protected-text";

const passphrase = ref("");
const input = ref<{ $el?: HTMLElement } | null>(null);
const { t } = useI18n();

watch(
  () => protectedText.state.promptVisible,
  async (visible) => {
    if (!visible) passphrase.value = "";
    else {
      await nextTick();
      input.value?.$el?.querySelector("input")?.focus();
    }
  },
);

async function unlock(): Promise<void> {
  await protectedText.unlock(passphrase.value);
  if (protectedText.state.error) {
    passphrase.value = "";
    await nextTick();
    input.value?.$el?.querySelector("input")?.focus();
  }
}
</script>

<template>
  <Dialog
    :visible="protectedText.state.promptVisible"
    modal
    :closable="false"
    :header="t('e2ee.unlockTitle')"
    class="unlock-dialog"
  >
    <p>{{ t("e2ee.unlockDescription") }}</p>
    <Message
      v-if="protectedText.state.error"
      severity="error"
      :closable="false"
      aria-live="polite"
    >
      {{ t("e2ee.unlockFailed") }}
    </Message>
    <form class="unlock-form" @submit.prevent="unlock">
      <label>
        <span>{{ t("e2ee.sharedPassphrase") }}</span>
        <Password
          ref="input"
          v-model="passphrase"
          :feedback="false"
          toggle-mask
          autocomplete="off"
          required
        />
      </label>
      <div class="actions">
        <Button
          type="button"
          severity="secondary"
          :label="t('e2ee.continueLocked')"
          @click="protectedText.skip()"
        />
        <Button
          type="submit"
          :label="t('e2ee.unlockAction')"
          :loading="protectedText.state.status === 'unlocking'"
        />
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.unlock-form,
.unlock-form label {
  display: grid;
  gap: 0.5rem;
}

.unlock-form {
  gap: 1rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.75rem;
}

:deep(.p-password),
:deep(.p-password-input) {
  width: 100%;
}
</style>
