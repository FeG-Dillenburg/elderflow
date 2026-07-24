<script lang="ts" setup>
import { useI18n } from "vue-i18n";

defineProps<{
  disabled: boolean;
  error: boolean;
  recoveryVisible: boolean;
}>();

defineEmits<{
  submit: [];
  recovery: [];
}>();

const model = defineModel<string>({ required: true });
const { t } = useI18n();
</script>

<template>
  <form class="unlock-form" @submit.prevent="$emit('submit')">
    <label>
      <span>{{ t("protectedPrototype.unlock.label") }}</span>
      <input
        v-model="model"
        type="password"
        autocomplete="off"
        :placeholder="t('protectedPrototype.unlock.placeholder')"
        :disabled="disabled"
      />
    </label>
    <p v-if="error" class="form-error" role="alert">
      <i class="pi pi-times-circle" aria-hidden="true" />
      {{ t("protectedPrototype.unlock.wrong") }}
    </p>
    <p v-if="disabled" class="form-error" role="status">
      <i class="pi pi-wifi-off" aria-hidden="true" />
      {{ t("protectedPrototype.unlock.offline") }}
    </p>
    <button class="primary-button" type="submit" :disabled="disabled">
      <i class="pi pi-lock-open" aria-hidden="true" />
      {{ t("protectedPrototype.actions.unlock") }}
    </button>
    <button
      class="recovery-button"
      type="button"
      @click="$emit('recovery')"
    >
      {{ t("protectedPrototype.unlock.forgot") }}
    </button>
    <div v-if="recoveryVisible" class="recovery-panel">
      <strong>{{ t("protectedPrototype.recovery.title") }}</strong>
      <p>{{ t("protectedPrototype.recovery.body") }}</p>
      <button type="button">
        {{ t("protectedPrototype.recovery.start") }}
      </button>
    </div>
    <small class="prototype-password">
      {{ t("protectedPrototype.unlock.demo") }}
      <code>elderflow-demo</code>
    </small>
  </form>
</template>
