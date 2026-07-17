<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Password from 'primevue/password';
import { api } from '../api/domain';

type Stage = 'loading' | 'password' | 'user' | 'complete' | 'already-setup' | 'error';

const stage = ref<Stage>('loading');
const setupPassword = ref('');
const form = reactive({ email: '', firstName: '', lastName: '', password: '', passwordConfirmation: '' });
const submitting = ref(false);
const errorMessage = ref('');

onMounted(async () => {
  try {
    const status = await api.setupStatus();
    stage.value = status.setupRequired ? 'password' : 'already-setup';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to check setup status';
    stage.value = 'error';
  }
});

async function verifyPassword(): Promise<void> {
  submitting.value = true;
  errorMessage.value = '';
  try {
    await api.verifySetupPassword(setupPassword.value);
    stage.value = 'user';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to verify setup password';
    if (errorMessage.value === 'System already setup') stage.value = 'already-setup';
  } finally {
    submitting.value = false;
  }
}

async function createUser(): Promise<void> {
  errorMessage.value = '';
  if (form.password !== form.passwordConfirmation) {
    errorMessage.value = 'Passwords do not match';
    return;
  }

  submitting.value = true;
  try {
    await api.createInitialUser({
      setupPassword: setupPassword.value,
      email: form.email,
      firstName: form.firstName,
      lastName: form.lastName,
      password: form.password,
    });
    stage.value = 'complete';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to create the initial user';
    if (errorMessage.value === 'System already setup') stage.value = 'already-setup';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="setup-page">
    <section class="setup-card">
      <div class="brand-mark">E</div>
      <p class="eyebrow">ElderFlow</p>
      <h1>System setup</h1>

      <p v-if="stage === 'loading'" class="description">Checking system status…</p>

      <template v-else-if="stage === 'already-setup'">
        <Message class="result-message" severity="info" :closable="false">System already setup</Message>
        <RouterLink class="login-link" to="/login">Go to sign in</RouterLink>
      </template>

      <template v-else-if="stage === 'complete'">
        <Message class="result-message" severity="success" :closable="false">Setup complete. Your superadmin account is ready.</Message>
        <RouterLink class="login-link" to="/login">Sign in</RouterLink>
      </template>

      <template v-else>
        <p v-if="stage === 'password'" class="description">
          Enter the setup password printed in the backend log to continue.
        </p>
        <p v-else-if="stage === 'user'" class="description">
          Create the first user. This account will be assigned the superadmin role.
        </p>
        <Message v-if="errorMessage" severity="error" :closable="false">{{ errorMessage }}</Message>

        <form v-if="stage === 'password'" class="setup-form" @submit.prevent="verifyPassword">
          <label>
            <span>Setup password</span>
            <Password v-model="setupPassword" :feedback="false" toggle-mask autocomplete="off" required autofocus />
          </label>
          <Button label="Continue" type="submit" :loading="submitting" />
        </form>

        <form v-else-if="stage === 'user'" class="setup-form" @submit.prevent="createUser">
          <label>
            <span>First name</span>
            <InputText v-model="form.firstName" autocomplete="given-name" maxlength="100" required autofocus />
          </label>
          <label>
            <span>Last name</span>
            <InputText v-model="form.lastName" autocomplete="family-name" maxlength="100" required />
          </label>
          <label>
            <span>Email</span>
            <InputText v-model="form.email" type="email" autocomplete="username" maxlength="320" required />
          </label>
          <label>
            <span>Password</span>
            <Password v-model="form.password" toggle-mask autocomplete="new-password" minlength="10" maxlength="200" required />
          </label>
          <label>
            <span>Confirm password</span>
            <Password v-model="form.passwordConfirmation" :feedback="false" toggle-mask autocomplete="new-password" minlength="10" maxlength="200" required />
          </label>
          <Button label="Create superadmin" type="submit" :loading="submitting" />
        </form>
      </template>
    </section>
  </main>
</template>

<style scoped>
.setup-page {
  display: grid;
  min-height: 100vh;
  padding: 1rem;
  place-items: center;
  background: #eef2f7;
}

.setup-card {
  width: min(32rem, 100%);
  padding: 2.5rem;
  border: 1px solid #e2e8f0;
  border-radius: 1rem;
  background: #fff;
  box-shadow: 0 24px 60px rgb(15 23 42 / 10%);
}

.brand-mark {
  display: grid;
  width: 2.8rem;
  height: 2.8rem;
  place-items: center;
  border-radius: .75rem;
  background: #315a9b;
  color: #fff;
  font-weight: 800;
}

.eyebrow {
  margin: 1.25rem 0 .35rem;
  color: #5572a7;
  font-size: .75rem;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  color: #1e293b;
}

.description {
  margin: .5rem 0 1.5rem;
  color: #64748b;
}

.setup-form,
.setup-form label {
  display: grid;
  gap: .45rem;
}

.setup-form {
  gap: 1rem;
  margin-top: 1rem;
}

.setup-form label {
  color: #334155;
  font-size: .9rem;
  font-weight: 600;
}

.login-link {
  display: inline-block;
  margin-top: 1.25rem;
  color: #315a9b;
  font-weight: 700;
}

.result-message {
  margin-top: 1rem;
}

:deep(input),
:deep(.p-password),
:deep(.p-password-input) {
  width: 100%;
}
</style>
