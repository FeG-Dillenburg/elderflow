<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Password from 'primevue/password';
import { auth } from '../auth/auth';

const route = useRoute();
const router = useRouter();
const form = reactive({ email: '', password: '' });
const saving = ref(false);
const errorMessage = ref('');

async function submit(): Promise<void> {
  saving.value = true;
  errorMessage.value = '';
  try {
    await auth.login(form.email, form.password);
    await router.push(typeof route.query.redirect === 'string' ? route.query.redirect : '/');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to sign in';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-card">
      <div class="brand-mark">E</div>
      <p class="eyebrow">ElderFlow</p>
      <h1>Welcome back</h1>
      <p class="description">Sign in to continue to your workspace.</p>
      <form class="login-form" @submit.prevent="submit">
        <Message v-if="errorMessage" severity="error" :closable="false">{{ errorMessage }}</Message>
        <label>
          <span>Email</span>
          <InputText v-model="form.email" type="email" autocomplete="username" required autofocus />
        </label>
        <label>
          <span>Password</span>
          <Password v-model="form.password" :feedback="false" toggle-mask autocomplete="current-password" required />
        </label>
        <Button label="Sign in" type="submit" :loading="saving" />
      </form>
    </section>
  </main>
</template>

<style scoped>
.login-page { display: grid; min-height: 100vh; padding: 1rem; place-items: center; background: #eef2f7; }
.login-card { width: min(28rem, 100%); padding: 2.5rem; border: 1px solid #e2e8f0; border-radius: 1rem; background: #fff; box-shadow: 0 24px 60px rgb(15 23 42 / 10%); }
.brand-mark { display: grid; width: 2.8rem; height: 2.8rem; place-items: center; border-radius: .75rem; background: #315a9b; color: #fff; font-weight: 800; }
.eyebrow { margin: 1.25rem 0 .35rem; color: #5572a7; font-size: .75rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
h1 { margin: 0; color: #1e293b; }
.description { margin: .5rem 0 1.5rem; color: #64748b; }
.login-form, .login-form label { display: grid; gap: .45rem; }
.login-form { gap: 1rem; }
.login-form label { color: #334155; font-size: .9rem; font-weight: 600; }
:deep(input), :deep(.p-password), :deep(.p-password-input) { width: 100%; }
</style>
