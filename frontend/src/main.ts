import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import Aura from '@primeuix/themes/aura';
import 'primeicons/primeicons.css';
import App from './App.vue';
import BackendStartingScreen from './components/BackendStartingScreen.vue';
import router from './router';
import { api } from './api/domain';
import { auth } from './auth/auth';
import { clearSessionToken, getSessionToken } from './auth/session';
import { bindPrimeVueLocale, i18n, primeVueLocale, setLanguage } from './i18n';
import { loadApplicationContext } from './i18n/initialize';
import { resolveEffectiveLanguage } from './i18n/language';
import { installation } from './installation';
import { protectedText } from './e2ee/protected-text';
import { isProviderTestReturn } from './auth/provider-test-return';

const hadSession = Boolean(getSessionToken());
const startupSignal = AbortSignal.timeout(2000);
const context = await loadApplicationContext({
  installation: () => api.installation({ signal: startupSignal }),
  currentUser: api.me,
  hasSession: hadSession,
  allowDevelopmentIdentity: import.meta.env.DEV,
  browserLanguages: navigator.languages,
});
if (context.installation) {
  installation.setupRequired = context.installation.setupRequired;
  installation.defaultLanguage = context.installation.defaultLanguage;
  installation.ready = true;
  auth.completeInitialization(context.user, true);
  if (hadSession && !context.user) clearSessionToken();
  setLanguage(context.language);
  if (context.user) await protectedText.offerUnlock(context.user, false);
  if (isProviderTestReturn(window.location)) auth.state.loginPending = false;
} else {
  setLanguage(resolveEffectiveLanguage({
    authenticated: false,
    userLanguage: null,
    installationDefault: null,
    browserLanguages: navigator.languages,
  }));
}

export const app = createApp(
  context.installation ? App : BackendStartingScreen,
  context.installation ? {} : { onReady: () => window.location.reload() },
)
  .use(i18n)
  .use(PrimeVue, {
    locale: primeVueLocale,
    theme: {
      preset: Aura,
      options: { darkModeSelector: false },
    },
  });

bindPrimeVueLocale(app.config.globalProperties.$primevue.config.locale!);
if (context.installation) app.use(router);
app.mount('#app');
