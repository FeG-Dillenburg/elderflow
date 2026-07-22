import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import Aura from '@primeuix/themes/aura';
import 'primeicons/primeicons.css';
import 'quill/dist/quill.snow.css';
import App from './App.vue';
import router from './router';
import { api } from './api/domain';
import { auth } from './auth/auth';
import { clearSessionToken, getSessionToken } from './auth/session';
import { bindPrimeVueLocale, i18n, primeVueLocale, setLanguage } from './i18n';
import { loadApplicationContext } from './i18n/initialize';
import { installation } from './installation';

const hadSession = Boolean(getSessionToken());
const context = await loadApplicationContext({
  installation: api.installation,
  currentUser: api.me,
  hasSession: hadSession,
  allowDevelopmentIdentity: import.meta.env.DEV,
  browserLanguages: navigator.languages,
});
if (context.installation) {
  installation.setupRequired = context.installation.setupRequired;
  installation.defaultLanguage = context.installation.defaultLanguage;
}
installation.ready = true;
auth.completeInitialization(context.user);
if (hadSession && !context.user) clearSessionToken();
setLanguage(context.language);

const app = createApp(App)
  .use(router)
  .use(i18n)
  .use(PrimeVue, {
    locale: primeVueLocale,
    theme: {
      preset: Aura,
      options: { darkModeSelector: false },
    },
  });

bindPrimeVueLocale(app.config.globalProperties.$primevue.config.locale!);
app.mount('#app');
