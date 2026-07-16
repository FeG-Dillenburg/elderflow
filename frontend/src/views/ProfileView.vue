<script setup lang="ts">
import { reactive, ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Password from 'primevue/password';
import { api } from '../api/domain';
import { auth } from '../auth/auth';

const user = auth.state.user!;
const form = reactive({ email: user.email, firstName: user.firstName, lastName: user.lastName, password: '' });
const saving = ref(false);
const message = ref<{ severity: 'success' | 'error'; text: string } | null>(null);

async function submit(): Promise<void> {
  saving.value = true;
  message.value = null;
  try {
    const updated = await api.updateProfile({ ...form, password: form.password || undefined });
    auth.setUser(updated);
    form.password = '';
    message.value = { severity: 'success', text: 'Profile updated.' };
  } catch (error) {
    message.value = { severity: 'error', text: error instanceof Error ? error.message : 'Unable to update profile' };
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="profile-page">
    <p class="eyebrow">Account</p>
    <h1>Your profile</h1>
    <p class="description">Update your personal details or choose a new password.</p>
    <form class="profile-card" @submit.prevent="submit">
      <Message v-if="message" :severity="message.severity" :closable="false">{{ message.text }}</Message>
      <div class="role-field"><span>Role</span><strong>{{ auth.state.user?.role }}</strong></div>
      <label><span>First name</span><InputText v-model="form.firstName" required maxlength="100" /></label>
      <label><span>Last name</span><InputText v-model="form.lastName" required maxlength="100" /></label>
      <label><span>Email</span><InputText v-model="form.email" type="email" required maxlength="320" /></label>
      <label><span>New password</span><Password v-model="form.password" :feedback="false" toggle-mask minlength="10" autocomplete="new-password" /></label>
      <Button label="Save profile" type="submit" :loading="saving" />
    </form>
  </section>
</template>

<style scoped>
.profile-page { max-width: 42rem; margin: 0 auto; }
.eyebrow { margin: 0 0 .35rem; color: #5572a7; font-size: .75rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
h1 { margin: 0; }
.description { color: #64748b; line-height: 1.6; }
.profile-card { display: grid; gap: 1rem; margin-top: 1.5rem; padding: 1.5rem; border: 1px solid #e2e8f0; border-radius: .9rem; background: #fff; }
.profile-card label, .role-field { display: grid; gap: .4rem; color: #334155; font-size: .9rem; font-weight: 600; }
.role-field strong { color: #315a9b; text-transform: capitalize; }
:deep(input), :deep(.p-password), :deep(.p-password-input) { width: 100%; }
.profile-card .p-button { justify-self: start; }
</style>
