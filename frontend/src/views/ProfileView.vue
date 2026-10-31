<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Password from "primevue/password";
import Select from "primevue/select";
import { useI18n } from "vue-i18n";
import { api } from "../api/domain";
import { auth } from "../auth/auth";
import { roleLabel } from "../auth/roles";
import { installation } from "../installation";
import { setLanguage } from "../i18n";

const user = auth.state.user!;
const form = reactive({
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  language: user.language,
  password: "",
});
const saving = ref(false);
const message = ref<{ severity: "success" | "error"; text: string } | null>(
  null,
);
const { t } = useI18n();
const languageOptions = computed(() => [
  { label: t("languages.installationDefault"), value: null },
  { label: t("languages.en"), value: "en" },
  { label: t("languages.de"), value: "de" },
]);

async function submit(): Promise<void> {
  saving.value = true;
  message.value = null;
  try {
    const updated = await api.updateProfile({
      ...form,
      password: form.password || undefined,
    });
    auth.setUser(updated);
    setLanguage(updated.language ?? installation.defaultLanguage ?? "en");
    form.password = "";
    message.value = { severity: "success", text: t("profile.updated") };
  } catch (error) {
    message.value = {
      severity: "error",
      text: error instanceof Error ? error.message : t("profile.failed"),
    };
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="profile-page">
    <p class="eyebrow">{{ t("profile.eyebrow") }}</p>
    <h1>{{ t("profile.title") }}</h1>
    <p class="description">{{ t("profile.description") }}</p>
    <form class="profile-card" @submit.prevent="submit">
      <Message v-if="message" :severity="message.severity" :closable="false">
        {{ message.text }}
      </Message>
      <div class="role-field">
        <span>{{ t("common.role") }}</span>
        <strong>{{ roleLabel(user.role) }}</strong>
      </div>
      <label>
        <span>{{ t("profile.firstName") }}</span>
        <InputText v-model="form.firstName" required maxlength="100" />
      </label>
      <label>
        <span>{{ t("profile.lastName") }}</span>
        <InputText v-model="form.lastName" required maxlength="100" />
      </label>
      <label>
        <span>{{ t("common.email") }}</span>
        <InputText v-model="form.email" type="email" required maxlength="320" />
      </label>
      <label>
        <span>{{ t("languages.label") }}</span>
        <Select
          v-model="form.language"
          :options="languageOptions"
          option-label="label"
          option-value="value"
        />
      </label>
      <label>
        <span>{{ t("profile.newPassword") }}</span>
        <Password
          v-model="form.password"
          :feedback="false"
          toggle-mask
          minlength="10"
          autocomplete="new-password"
        />
      </label>
      <Button :label="t('profile.save')" type="submit" :loading="saving" />
    </form>
  </section>
</template>

<style scoped>
.profile-page {
  max-width: 42rem;
  margin: 0 auto;
}
.eyebrow {
  margin: 0 0 0.35rem;
  color: #5572a7;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
h1 {
  margin: 0;
}
.description {
  color: #64748b;
  line-height: 1.6;
}
.profile-card {
  display: grid;
  gap: 1rem;
  margin-top: 1.5rem;
  padding: 1.5rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.9rem;
  background: #fff;
}
.profile-card label,
.role-field {
  display: grid;
  gap: 0.4rem;
  color: #334155;
  font-size: 0.9rem;
  font-weight: 600;
}
.role-field strong {
  color: #315a9b;
  text-transform: capitalize;
}
:deep(input),
:deep(.p-password),
:deep(.p-password-input) {
  width: 100%;
}
.profile-card .p-button {
  justify-self: start;
}
</style>
