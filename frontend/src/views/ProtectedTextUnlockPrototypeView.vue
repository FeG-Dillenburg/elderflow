<!--
  PROTOTYPE — throw away after the decision.
  Three variants of the post-login Protected-text unlock experience,
  switchable via ?variant=, on /prototype/protected-text-unlock.
-->
<script lang="ts" setup>
import {
  computed,
  nextTick,
  reactive,
  ref,
  watch,
} from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import PrototypeSwitcher from "../components/PrototypeSwitcher.vue";
import ProtectedCard from "../components/prototype/ProtectedTextCard.vue";
import SecurityBoundary from "../components/prototype/ProtectedTextSecurityBoundary.vue";
import UnlockForm from "../components/prototype/ProtectedTextUnlockForm.vue";
import { setLanguage } from "../i18n";

type Role = "content" | "it-admin";
type KeyState = "locked" | "unlocked";
type NetworkState = "online" | "offline" | "reconnecting";

const CORRECT_PASSPHRASE = "elderflow-demo";
const route = useRoute();
const { locale, t } = useI18n();
const variants = computed(() => [
  { key: "A", name: t("protectedPrototype.variants.a") },
  { key: "B", name: t("protectedPrototype.variants.b") },
  { key: "C", name: t("protectedPrototype.variants.c") },
]);
const variant = computed(() =>
  ["A", "B", "C"].includes(String(route.query.variant))
    ? String(route.query.variant)
    : "A",
);
const state = reactive({
  role: "content" as Role,
  keyState: "locked" as KeyState,
  network: "online" as NetworkState,
  signedIn: true,
  promptVisible: String(route.query.variant ?? "A") === "A",
  recoveryVisible: false,
  showCiphertext: false,
  password: "",
  passwordError: false,
  queuedChanges: 0,
  currentTab: "locked",
  secondTab: "not opened",
  phone: "locked",
});
const eventLog = ref<Array<string>>([t("protectedPrototype.events.signedIn")]);
const note = ref(t("protectedPrototype.sample.note"));
const editBlocked = ref(false);

const canUnlock = computed(
  () =>
    state.signedIn &&
    state.role === "content" &&
    state.network !== "offline",
);
const canRead = computed(
  () => state.role === "content" && state.keyState === "unlocked",
);
const canEdit = computed(() => canRead.value);
const stateLabel = computed(() =>
  t(`protectedPrototype.states.${state.keyState}`),
);
const networkLabel = computed(() =>
  t(`protectedPrototype.network.${state.network}`),
);

function log(key: string): void {
  eventLog.value.unshift(t(`protectedPrototype.events.${key}`));
  eventLog.value = eventLog.value.slice(0, 5);
}

function unlock(): void {
  state.passwordError = false;
  if (!canUnlock.value) return;
  if (state.password !== CORRECT_PASSPHRASE) {
    state.passwordError = true;
    log("wrongPassword");
    return;
  }
  state.keyState = "unlocked";
  state.promptVisible = false;
  state.recoveryVisible = false;
  state.password = "";
  state.currentTab = "unlocked here only";
  log("unlocked");
}

function skip(): void {
  state.promptVisible = false;
  log("skipped");
}

function lock(reason = "locked"): void {
  state.keyState = "locked";
  state.password = "";
  state.passwordError = false;
  state.recoveryVisible = false;
  state.currentTab = "locked";
  log(reason);
}

function reload(): void {
  lock("reloaded");
  state.promptVisible = variant.value === "A";
}

function logout(): void {
  lock("loggedOut");
  state.signedIn = false;
  state.promptVisible = false;
}

function signIn(): void {
  state.signedIn = true;
  state.promptVisible = variant.value === "A";
  log("signedIn");
}

function setRole(role: Role): void {
  state.role = role;
  if (role === "it-admin") {
    state.keyState = "locked";
    state.promptVisible = false;
    state.recoveryVisible = false;
    log("itAdmin");
  } else {
    state.promptVisible = variant.value === "A";
    log("contentUser");
  }
}

function toggleNetwork(): void {
  if (state.network === "online") {
    state.network = "offline";
    log(state.keyState === "unlocked" ? "offlineUnlocked" : "offlineLocked");
    return;
  }
  state.network = "reconnecting";
  log("reconnecting");
  window.setTimeout(() => {
    state.network = "online";
    state.queuedChanges = 0;
    log("reconnected");
  }, 900);
}

function editNote(): void {
  if (!canEdit.value) {
    editBlocked.value = true;
    log("editBlocked");
    return;
  }
  editBlocked.value = false;
  if (state.network === "offline") {
    state.queuedChanges += 1;
  }
}

function openSecondTab(): void {
  state.secondTab = "locked — unlock separately";
  log("secondTab");
}

function unlockPhone(): void {
  state.phone = "unlocked independently";
  log("phoneUnlocked");
}

function changeLanguage(): void {
  setLanguage(locale.value === "en" ? "de" : "en");
}

watch(variant, () => {
  state.promptVisible =
    state.role === "content" &&
    state.keyState === "locked" &&
    variant.value === "A";
  state.recoveryVisible = false;
  state.passwordError = false;
  void nextTick(() => window.scrollTo({ top: 0, behavior: "smooth" }));
});
</script>

<template>
  <main class="prototype-page">
    <header class="prototype-header">
      <div>
        <span class="prototype-kicker">{{
          t("protectedPrototype.prototype")
        }}</span>
        <strong>{{ t("protectedPrototype.question") }}</strong>
      </div>
      <button class="language-button" type="button" @click="changeLanguage">
        <i class="pi pi-language" aria-hidden="true" />
        {{ locale === "en" ? "Deutsch" : "English" }}
      </button>
    </header>

    <section v-if="!state.signedIn" class="signed-out">
      <img
        src="/elderflow-wordmark-color.png"
        :alt="t('brand.name')"
      />
      <i class="pi pi-sign-out" aria-hidden="true" />
      <h1>{{ t("protectedPrototype.signedOut.title") }}</h1>
      <p>{{ t("protectedPrototype.signedOut.body") }}</p>
      <button class="primary-button" type="button" @click="signIn">
        {{ t("protectedPrototype.signedOut.signIn") }}
      </button>
    </section>

    <div v-else class="app-frame">
      <aside class="app-sidebar">
        <div class="brand">
          <img src="/elderflow-logo.svg" alt="" aria-hidden="true" />
          <img
            src="/elderflow-wordmark-white.png"
            :alt="t('brand.name')"
          />
        </div>
        <nav :aria-label="t('nav.main')">
          <a :class="{ active: variant !== 'C' }" href="#">
            <i class="pi pi-home" aria-hidden="true" />
            {{ t("nav.dashboard") }}
          </a>
          <a :class="{ active: variant === 'C' }" href="#">
            <i class="pi pi-calendar" aria-hidden="true" />
            {{ t("nav.meetings") }}
          </a>
          <a href="#">
            <i class="pi pi-comments" aria-hidden="true" />
            {{ t("nav.topics") }}
          </a>
          <a href="#">
            <i class="pi pi-check-square" aria-hidden="true" />
            {{ t("nav.tasks") }}
          </a>
        </nav>
        <div class="sidebar-user">
          <span>DM</span>
          <div>
            <strong>Daniel Müller</strong>
            <small>{{
              state.role === "it-admin"
                ? t("roles.it-admin")
                : t("roles.admin")
            }}</small>
          </div>
        </div>
      </aside>

      <section class="app-content">
        <div class="utility-bar">
          <span :class="['security-chip', state.keyState]">
            <i
              :class="
                state.keyState === 'unlocked'
                  ? 'pi pi-lock-open'
                  : 'pi pi-lock'
              "
              aria-hidden="true"
            />
            {{
              state.role === "it-admin"
                ? t("protectedPrototype.states.unavailable")
                : stateLabel
            }}
          </span>
          <span :class="['network-chip', state.network]">
            <i
              :class="
                state.network === 'offline'
                  ? 'pi pi-wifi-off'
                  : 'pi pi-wifi'
              "
              aria-hidden="true"
            />
            {{ networkLabel }}
          </span>
        </div>

        <div
          v-if="state.role === 'it-admin'"
          class="it-admin-surface"
        >
          <span class="large-icon">
            <i class="pi pi-server" aria-hidden="true" />
          </span>
          <p class="eyebrow">{{ t("protectedPrototype.itAdmin.eyebrow") }}</p>
          <h1>{{ t("protectedPrototype.itAdmin.title") }}</h1>
          <p>{{ t("protectedPrototype.itAdmin.body") }}</p>
          <div class="metadata-card">
            <span>{{ t("protectedPrototype.itAdmin.health") }}</span>
            <strong>{{ t("protectedPrototype.itAdmin.healthy") }}</strong>
          </div>
        </div>

        <template v-else-if="variant === 'A'">
          <div class="page-heading">
            <p class="eyebrow">{{ t("dashboard.eyebrow") }}</p>
            <h1>{{ t("dashboard.title") }}</h1>
            <p>{{ t("dashboard.description") }}</p>
          </div>
          <div class="dashboard-grid">
            <article class="next-meeting">
              <span class="card-label">{{
                t("dashboard.nextMeeting")
              }}</span>
              <h2>{{ t("protectedPrototype.sample.meeting") }}</h2>
              <p>{{ t("protectedPrototype.sample.date") }}</p>
              <button class="primary-button" type="button">
                {{ t("dashboard.openAgenda") }}
              </button>
            </article>
            <ProtectedCard
              :can-read="canRead"
              :show-ciphertext="state.showCiphertext"
              :title="t('dashboard.recentTopics')"
              :locked-copy="t('protectedPrototype.locked.placeholder')"
              @blocked-edit="editNote"
            />
            <article class="plain-card">
              <span class="card-label">{{ t("dashboard.myTasks") }}</span>
              <ul>
                <li>
                  <span>{{ t("protectedPrototype.sample.task") }}</span>
                  <small>{{ t("protectedPrototype.sample.due") }}</small>
                </li>
              </ul>
            </article>
          </div>

          <div v-if="state.promptVisible" class="modal-backdrop">
            <section class="unlock-modal" role="dialog" aria-modal="true">
              <span class="unlock-icon">
                <i class="pi pi-shield" aria-hidden="true" />
              </span>
              <p class="eyebrow">{{ t("protectedPrototype.a.eyebrow") }}</p>
              <h2>{{ t("protectedPrototype.a.title") }}</h2>
              <p>{{ t("protectedPrototype.a.body") }}</p>
              <UnlockForm
                v-model="state.password"
                :disabled="!canUnlock"
                :error="state.passwordError"
                :recovery-visible="state.recoveryVisible"
                @submit="unlock"
                @recovery="state.recoveryVisible = true"
              />
              <button class="text-button" type="button" @click="skip">
                {{ t("protectedPrototype.actions.skip") }}
              </button>
              <SecurityBoundary />
            </section>
          </div>
        </template>

        <template v-else-if="variant === 'B'">
          <div class="page-heading compact">
            <div>
              <p class="eyebrow">{{ t("dashboard.eyebrow") }}</p>
              <h1>{{ t("protectedPrototype.b.greeting") }}</h1>
            </div>
          </div>
          <section
            v-if="state.keyState === 'locked'"
            class="unlock-banner"
          >
            <span class="banner-icon">
              <i class="pi pi-lock" aria-hidden="true" />
            </span>
            <div>
              <strong>{{ t("protectedPrototype.b.title") }}</strong>
              <p>{{ t("protectedPrototype.b.body") }}</p>
            </div>
            <button
              class="primary-button"
              type="button"
              @click="state.promptVisible = !state.promptVisible"
            >
              {{ t("protectedPrototype.actions.unlock") }}
            </button>
          </section>
          <section v-if="state.promptVisible" class="inline-unlock">
            <UnlockForm
              v-model="state.password"
              :disabled="!canUnlock"
              :error="state.passwordError"
              :recovery-visible="state.recoveryVisible"
              @submit="unlock"
              @recovery="state.recoveryVisible = true"
            />
            <SecurityBoundary />
          </section>
          <div class="bento-grid">
            <article class="meeting-strip">
              <div>
                <span class="card-label">{{
                  t("dashboard.nextMeeting")
                }}</span>
                <h2>{{ t("protectedPrototype.sample.meeting") }}</h2>
                <p>{{ t("protectedPrototype.sample.date") }}</p>
              </div>
              <button class="secondary-button" type="button">
                {{ t("dashboard.openAgenda") }}
              </button>
            </article>
            <article class="plain-card">
              <span class="card-label">{{ t("dashboard.myTasks") }}</span>
              <h3>{{ t("protectedPrototype.sample.task") }}</h3>
              <small>{{ t("protectedPrototype.sample.due") }}</small>
            </article>
            <ProtectedCard
              :can-read="canRead"
              :show-ciphertext="state.showCiphertext"
              :title="t('dashboard.followUps')"
              :locked-copy="t('protectedPrototype.b.contextual')"
              @blocked-edit="editNote"
              @unlock="state.promptVisible = true"
            />
            <ProtectedCard
              :can-read="canRead"
              :show-ciphertext="state.showCiphertext"
              :title="t('dashboard.recentTopics')"
              :locked-copy="t('protectedPrototype.b.contextual')"
              @blocked-edit="editNote"
              @unlock="state.promptVisible = true"
            />
          </div>
        </template>

        <template v-else>
          <div class="meeting-heading">
            <a href="#" class="back-link">
              <i class="pi pi-arrow-left" aria-hidden="true" />
              {{ t("nav.meetings") }}
            </a>
            <div>
              <p class="eyebrow">{{ t("meetingAgenda.eyebrow") }}</p>
              <h1>{{ t("protectedPrototype.sample.meeting") }}</h1>
              <p>{{ t("protectedPrototype.sample.date") }}</p>
            </div>
          </div>
          <section
            v-if="state.keyState === 'locked'"
            class="checkpoint"
          >
            <div class="checkpoint-illustration">
              <span><i class="pi pi-calendar" aria-hidden="true" /></span>
              <i class="pi pi-lock" aria-hidden="true" />
            </div>
            <p class="eyebrow">{{ t("protectedPrototype.c.eyebrow") }}</p>
            <h2>{{ t("protectedPrototype.c.title") }}</h2>
            <p>{{ t("protectedPrototype.c.body") }}</p>
            <UnlockForm
              v-model="state.password"
              :disabled="!canUnlock"
              :error="state.passwordError"
              :recovery-visible="state.recoveryVisible"
              @submit="unlock"
              @recovery="state.recoveryVisible = true"
            />
            <a href="#" class="leave-link">{{
              t("protectedPrototype.c.leave")
            }}</a>
            <SecurityBoundary />
          </section>
          <section v-else class="agenda-surface">
            <div class="agenda-meta">
              <span>
                <i class="pi pi-lock-open" aria-hidden="true" />
                {{ t("protectedPrototype.unlocked.session") }}
              </span>
              <span>{{ t("protectedPrototype.sample.participants") }}</span>
            </div>
            <article>
              <small>{{ t("protectedPrototype.sample.section") }}</small>
              <h2>{{ t("protectedPrototype.sample.topic") }}</h2>
              <label>
                {{ t("meetingTexts.preparationContext") }}
                <textarea v-model="note" @input="editNote" />
              </label>
            </article>
          </section>
        </template>
      </section>
    </div>

    <aside class="state-lab">
      <details open>
        <summary>
          <span>
            <i class="pi pi-sliders-h" aria-hidden="true" />
            {{ t("protectedPrototype.lab.title") }}
          </span>
          <small>{{ t("protectedPrototype.lab.hint") }}</small>
        </summary>
        <div class="lab-grid">
          <section>
            <h3>{{ t("protectedPrototype.lab.identity") }}</h3>
            <div class="segmented">
              <button
                :class="{ active: state.role === 'content' }"
                type="button"
                @click="setRole('content')"
              >
                {{ t("protectedPrototype.lab.contentUser") }}
              </button>
              <button
                :class="{ active: state.role === 'it-admin' }"
                type="button"
                @click="setRole('it-admin')"
              >
                {{ t("roles.it-admin") }}
              </button>
            </div>
          </section>
          <section>
            <h3>{{ t("protectedPrototype.lab.session") }}</h3>
            <div class="lab-actions">
              <button type="button" @click="reload">
                <i class="pi pi-refresh" aria-hidden="true" />
                {{ t("protectedPrototype.actions.reload") }}
              </button>
              <button type="button" @click="logout">
                <i class="pi pi-sign-out" aria-hidden="true" />
                {{ t("protectedPrototype.actions.logout") }}
              </button>
              <button
                v-if="state.keyState === 'unlocked'"
                type="button"
                @click="lock()"
              >
                <i class="pi pi-lock" aria-hidden="true" />
                {{ t("protectedPrototype.actions.lock") }}
              </button>
            </div>
          </section>
          <section>
            <h3>{{ t("protectedPrototype.lab.connectivity") }}</h3>
            <button
              class="wide-control"
              type="button"
              :disabled="state.network === 'reconnecting'"
              @click="toggleNetwork"
            >
              <i class="pi pi-wifi" aria-hidden="true" />
              {{
                state.network === "online"
                  ? t("protectedPrototype.actions.goOffline")
                  : t("protectedPrototype.actions.reconnect")
              }}
            </button>
          </section>
          <section>
            <h3>{{ t("protectedPrototype.lab.otherDevices") }}</h3>
            <div class="lab-actions">
              <button type="button" @click="openSecondTab">
                {{ t("protectedPrototype.actions.secondTab") }}
              </button>
              <button type="button" @click="unlockPhone">
                {{ t("protectedPrototype.actions.phone") }}
              </button>
            </div>
          </section>
          <section>
            <h3>{{ t("protectedPrototype.lab.lockedData") }}</h3>
            <label class="toggle-row">
              <input v-model="state.showCiphertext" type="checkbox" />
              {{ t("protectedPrototype.actions.ciphertext") }}
            </label>
          </section>
        </div>
        <div class="state-readout">
          <div>
            <span>{{ t("protectedPrototype.lab.keyState") }}</span>
            <strong>{{ stateLabel }}</strong>
          </div>
          <div>
            <span>{{ t("protectedPrototype.lab.network") }}</span>
            <strong>{{ networkLabel }}</strong>
          </div>
          <div>
            <span>{{ t("protectedPrototype.lab.currentTab") }}</span>
            <strong>{{ state.currentTab }}</strong>
          </div>
          <div>
            <span>{{ t("protectedPrototype.lab.secondTab") }}</span>
            <strong>{{ state.secondTab }}</strong>
          </div>
          <div>
            <span>{{ t("protectedPrototype.lab.phone") }}</span>
            <strong>{{ state.phone }}</strong>
          </div>
          <div>
            <span>{{ t("protectedPrototype.lab.queued") }}</span>
            <strong>{{ state.queuedChanges }}</strong>
          </div>
        </div>
        <ol class="event-log">
          <li v-for="entry in eventLog" :key="entry">{{ entry }}</li>
        </ol>
      </details>
    </aside>

    <div v-if="editBlocked" class="toast" role="status">
      <i class="pi pi-lock" aria-hidden="true" />
      {{ t("protectedPrototype.locked.editBlocked") }}
      <button type="button" @click="editBlocked = false">
        <i class="pi pi-times" aria-hidden="true" />
      </button>
    </div>

    <PrototypeSwitcher :variants="variants" />
  </main>
</template>

<style>
:global(*) {
  box-sizing: border-box;
}

:global(body) {
  margin: 0;
  min-width: 320px;
  background: #e9edf3;
  color: #243047;
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

button,
input,
textarea {
  font: inherit;
}

button {
  cursor: pointer;
}

.prototype-page {
  min-height: 100vh;
  padding-bottom: 22rem;
}

.prototype-header {
  display: flex;
  min-height: 3rem;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.65rem 1rem;
  background: #f7d66d;
  color: #43370d;
  font-size: 0.78rem;
}

.prototype-header > div {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.prototype-kicker {
  padding: 0.25rem 0.45rem;
  border-radius: 0.3rem;
  background: #43370d;
  color: #fff9df;
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.1em;
}

.language-button {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  border: 0;
  background: transparent;
  color: inherit;
  font-weight: 750;
}

.app-frame {
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr);
  min-height: 760px;
  background: #f5f6f8;
}

.app-sidebar {
  display: flex;
  flex-direction: column;
  padding: 1.4rem 0.9rem;
  background: #18253c;
  color: #fff;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0 0.55rem 2rem;
}

.brand img:first-child {
  width: 1.9rem;
}

.brand img:last-child {
  width: 6.7rem;
}

.app-sidebar nav {
  display: grid;
  gap: 0.25rem;
}

.app-sidebar nav a {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.7rem 0.8rem;
  border-radius: 0.55rem;
  color: #dce5f4;
  text-decoration: none;
}

.app-sidebar nav a.active,
.app-sidebar nav a:hover {
  background: rgb(255 255 255 / 10%);
  color: #fff;
}

.sidebar-user {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: auto;
  padding: 0.8rem 0.4rem 0;
  border-top: 1px solid rgb(255 255 255 / 12%);
}

.sidebar-user > span {
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border-radius: 50%;
  background: #edf2fb;
  color: #243047;
  font-size: 0.68rem;
  font-weight: 800;
}

.sidebar-user strong,
.sidebar-user small {
  display: block;
}

.sidebar-user strong {
  font-size: 0.78rem;
}

.sidebar-user small {
  color: #aebbd0;
  font-size: 0.66rem;
}

.app-content {
  position: relative;
  min-width: 0;
  padding: 4.5rem 2rem 2rem;
}

.utility-bar {
  position: absolute;
  top: 1rem;
  right: 1.5rem;
  display: flex;
  gap: 0.45rem;
}

.security-chip,
.network-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.32rem 0.55rem;
  border: 1px solid #d7dde7;
  border-radius: 999px;
  background: #fff;
  color: #546174;
  font-size: 0.7rem;
  font-weight: 750;
}

.security-chip.unlocked {
  border-color: #a8dec4;
  background: #edf9f3;
  color: #18724c;
}

.network-chip.offline {
  border-color: #efcc7c;
  background: #fff9e9;
  color: #805b08;
}

.network-chip.reconnecting {
  color: #365c96;
}

.page-heading,
.meeting-heading {
  margin: 0 auto 1.5rem;
  max-width: 1100px;
}

.page-heading.compact {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}

.eyebrow {
  margin: 0 0 0.3rem;
  color: #607dae;
  font-size: 0.69rem;
  font-weight: 850;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 0.4rem;
  font-size: clamp(1.8rem, 4vw, 2.35rem);
  letter-spacing: -0.04em;
}

.page-heading > p:last-child {
  color: #68758a;
}

.dashboard-grid,
.bento-grid {
  display: grid;
  max-width: 1100px;
  margin: 0 auto;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.dashboard-grid article,
.bento-grid article {
  min-width: 0;
  padding: 1.25rem;
  border: 1px solid #e0e5ec;
  border-radius: 0.8rem;
  background: #fff;
  box-shadow: 0 8px 24px rgb(31 41 55 / 4%);
}

.next-meeting,
.meeting-strip {
  grid-column: span 2;
  background: linear-gradient(120deg, #fff, #f1f5fc) !important;
}

.meeting-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.card-label {
  display: block;
  margin-bottom: 0.8rem;
  color: #5f6d81;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.plain-card ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.plain-card li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.plain-card small {
  color: #748197;
}

.primary-button,
.secondary-button,
.recovery-panel button {
  display: inline-flex;
  min-height: 2.65rem;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding: 0.68rem 1rem;
  border: 0;
  border-radius: 0.5rem;
  background: #3b6bb3;
  color: #fff;
  font-weight: 750;
}

.primary-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.secondary-button {
  border: 1px solid #b8c5d8;
  background: #fff;
  color: #34445d;
}

.text-button,
.recovery-button {
  padding: 0;
  border: 0;
  background: transparent;
  color: #315f9f;
  font-weight: 750;
}

.protected-card header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.protected-tag {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.45rem;
  border-radius: 999px;
  background: #eef3fa;
  color: #526b8e;
  font-size: 0.62rem;
  font-weight: 800;
}

.locked-placeholder {
  display: grid;
  min-height: 7.5rem;
  margin-bottom: 0.8rem;
  padding: 1rem;
  place-items: center;
  border: 1px dashed #c9d1dd;
  border-radius: 0.6rem;
  background:
    repeating-linear-gradient(
      135deg,
      #f8f9fb,
      #f8f9fb 8px,
      #f1f3f6 8px,
      #f1f3f6 16px
    );
  color: #68758a;
  text-align: center;
}

.locked-placeholder p {
  margin-bottom: 0.5rem;
  font-size: 0.82rem;
}

.locked-placeholder code {
  max-width: 100%;
  color: #69778c;
  font-size: 0.7rem;
  overflow-wrap: anywhere;
}

.modal-backdrop {
  position: absolute;
  z-index: 20;
  inset: 0;
  display: grid;
  padding: 1rem;
  place-items: center;
  background: rgb(24 37 60 / 42%);
  backdrop-filter: blur(2px);
}

.unlock-modal {
  width: min(31rem, 100%);
  padding: 2rem;
  border-radius: 1rem;
  background: #fff;
  box-shadow: 0 26px 80px rgb(15 23 42 / 30%);
}

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

.unlock-form {
  display: grid;
  gap: 0.75rem;
  margin: 1.2rem 0 0.75rem;
}

.unlock-form label {
  display: grid;
  gap: 0.35rem;
  color: #36445a;
  font-size: 0.8rem;
  font-weight: 750;
}

.unlock-form input {
  width: 100%;
  min-height: 2.75rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid #b9c3d0;
  border-radius: 0.5rem;
}

.unlock-form input:focus {
  border-color: #3b6bb3;
  outline: 3px solid rgb(59 107 179 / 15%);
}

.form-error {
  margin: 0;
  color: #a12f3e;
  font-size: 0.78rem;
}

.recovery-button {
  justify-self: start;
  font-size: 0.78rem;
}

.recovery-panel {
  padding: 0.9rem;
  border-left: 3px solid #c08b1c;
  border-radius: 0.35rem;
  background: #fff8e6;
  font-size: 0.8rem;
}

.recovery-panel p {
  margin: 0.35rem 0 0.7rem;
}

.recovery-panel button {
  min-height: 2.2rem;
  background: #675019;
  font-size: 0.75rem;
}

.prototype-password {
  color: #7c8798;
}

.prototype-password code {
  color: #4b5870;
}

.security-boundary {
  display: flex;
  gap: 0.45rem;
  margin: 1rem 0 0;
  padding-top: 0.9rem;
  border-top: 1px solid #e4e8ef;
  color: #69778b;
  font-size: 0.72rem;
}

.unlock-banner {
  display: grid;
  max-width: 1100px;
  margin: 0 auto 1rem;
  padding: 1rem;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.9rem;
  border: 1px solid #bad1ef;
  border-radius: 0.75rem;
  background: #edf5ff;
}

.unlock-banner p {
  margin: 0.2rem 0 0;
  color: #52657e;
  font-size: 0.82rem;
}

.banner-icon {
  display: grid;
  width: 2.6rem;
  height: 2.6rem;
  place-items: center;
  border-radius: 50%;
  background: #fff;
  color: #3b6bb3;
}

.inline-unlock {
  display: grid;
  max-width: 1100px;
  margin: 0 auto 1rem;
  padding: 1rem;
  grid-template-columns: minmax(15rem, 24rem) 1fr;
  align-items: end;
  gap: 1.5rem;
  border: 1px solid #dbe2ec;
  border-radius: 0.75rem;
  background: #fff;
}

.checkpoint {
  max-width: 38rem;
  margin: 1rem auto;
  padding: clamp(1.3rem, 4vw, 2.4rem);
  border: 1px solid #dce2ea;
  border-radius: 1rem;
  background: #fff;
  box-shadow: 0 18px 50px rgb(31 41 55 / 8%);
  text-align: center;
}

.checkpoint .unlock-form,
.checkpoint .security-boundary {
  text-align: left;
}

.checkpoint-illustration {
  position: relative;
  width: 5.5rem;
  height: 5.5rem;
  margin: 0 auto 1.2rem;
}

.checkpoint-illustration > span {
  display: grid;
  width: 5rem;
  height: 5rem;
  place-items: center;
  border-radius: 1.2rem;
  background: #edf3fb;
  color: #416a9f;
  font-size: 2rem;
}

.checkpoint-illustration > i {
  position: absolute;
  right: 0;
  bottom: 0;
  display: grid;
  width: 2.2rem;
  height: 2.2rem;
  place-items: center;
  border: 3px solid #fff;
  border-radius: 50%;
  background: #243d63;
  color: #fff;
}

.leave-link,
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.75rem;
  color: #536b8f;
  font-size: 0.8rem;
  font-weight: 700;
}

.back-link {
  margin: 0 0 1.5rem;
  text-decoration: none;
}

.agenda-surface {
  max-width: 900px;
  margin: 0 auto;
}

.agenda-meta {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.8rem;
  color: #607087;
  font-size: 0.76rem;
}

.agenda-surface article {
  padding: 1.4rem;
  border: 1px solid #dce2ea;
  border-radius: 0.8rem;
  background: #fff;
}

.agenda-surface label {
  display: grid;
  gap: 0.45rem;
  color: #58677c;
  font-size: 0.78rem;
  font-weight: 750;
}

.agenda-surface textarea {
  min-height: 11rem;
  padding: 0.8rem;
  border: 1px solid #c6ced9;
  border-radius: 0.5rem;
  color: #26364e;
  line-height: 1.55;
  resize: vertical;
}

.it-admin-surface,
.signed-out {
  max-width: 34rem;
  margin: 4rem auto;
  padding: 2rem;
  text-align: center;
}

.large-icon,
.signed-out > i {
  display: grid;
  width: 4rem;
  height: 4rem;
  margin: 0 auto 1rem;
  place-items: center;
  border-radius: 1rem;
  background: #e7edf5;
  color: #486180;
  font-size: 1.6rem;
}

.metadata-card {
  display: flex;
  justify-content: space-between;
  margin-top: 1.5rem;
  padding: 1rem;
  border: 1px solid #dae1ea;
  border-radius: 0.6rem;
  background: #fff;
}

.metadata-card strong {
  color: #17744b;
}

.signed-out {
  margin-top: 6rem;
  border: 1px solid #dce2ea;
  border-radius: 1rem;
  background: #fff;
}

.signed-out > img {
  width: 11rem;
  margin-bottom: 1.5rem;
}

.state-lab {
  max-width: 1160px;
  margin: 1rem auto 0;
  padding: 0 1rem;
}

.state-lab details {
  overflow: hidden;
  border: 1px solid #cbd3df;
  border-radius: 0.8rem;
  background: #fff;
  box-shadow: 0 8px 24px rgb(31 41 55 / 5%);
}

.state-lab summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1rem;
  background: #edf1f6;
  cursor: pointer;
  list-style: none;
}

.state-lab summary span {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 850;
}

.state-lab summary small {
  color: #6b7789;
}

.lab-grid {
  display: grid;
  padding: 1rem;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1rem;
}

.lab-grid section {
  min-width: 0;
}

.lab-grid h3 {
  margin-bottom: 0.45rem;
  color: #607087;
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.segmented,
.lab-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.segmented {
  padding: 0.2rem;
  border-radius: 0.45rem;
  background: #e8edf3;
}

.segmented button,
.lab-actions button,
.wide-control {
  min-height: 2.2rem;
  padding: 0.48rem 0.6rem;
  border: 1px solid #cdd5e0;
  border-radius: 0.4rem;
  background: #fff;
  color: #34445d;
  font-size: 0.7rem;
  font-weight: 720;
}

.segmented button {
  flex: 1;
  border: 0;
  background: transparent;
}

.segmented button.active {
  background: #fff;
  box-shadow: 0 1px 4px rgb(31 41 55 / 12%);
}

.wide-control {
  width: 100%;
}

.toggle-row {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  color: #435169;
  font-size: 0.72rem;
}

.state-readout {
  display: grid;
  margin: 0 1rem;
  padding: 0.8rem;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.5rem;
  border-radius: 0.55rem;
  background: #18253c;
  color: #fff;
}

.state-readout div {
  min-width: 0;
}

.state-readout span,
.state-readout strong {
  display: block;
}

.state-readout span {
  color: #aebbd0;
  font-size: 0.58rem;
  text-transform: uppercase;
}

.state-readout strong {
  margin-top: 0.2rem;
  font-size: 0.68rem;
  overflow-wrap: anywhere;
}

.event-log {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin: 0;
  padding: 0.8rem 1rem 1rem;
  list-style: none;
}

.event-log li {
  padding: 0.28rem 0.5rem;
  border-radius: 999px;
  background: #f0f3f7;
  color: #5c697d;
  font-size: 0.62rem;
}

.toast {
  position: fixed;
  z-index: 90;
  top: 4rem;
  right: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  max-width: 22rem;
  padding: 0.8rem;
  border-left: 4px solid #bd3f4e;
  border-radius: 0.5rem;
  background: #fff;
  box-shadow: 0 12px 35px rgb(15 23 42 / 20%);
  color: #7d2533;
  font-size: 0.8rem;
}

.toast button {
  border: 0;
  background: transparent;
}

@media (max-width: 920px) {
  .app-frame {
    grid-template-columns: 1fr;
  }

  .app-sidebar {
    min-height: auto;
  }

  .app-sidebar nav {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .sidebar-user {
    display: none;
  }

  .lab-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .state-readout {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .prototype-page {
    padding-bottom: 30rem;
  }

  .prototype-header {
    align-items: flex-start;
  }

  .prototype-header > div {
    display: grid;
    gap: 0.35rem;
  }

  .prototype-header strong {
    font-size: 0.68rem;
  }

  .app-sidebar {
    padding: 0.8rem;
  }

  .brand {
    margin: 0 0 0.7rem;
  }

  .app-sidebar nav {
    grid-template-columns: repeat(4, 1fr);
  }

  .app-sidebar nav a {
    display: grid;
    place-items: center;
    padding: 0.55rem 0.2rem;
    font-size: 0.62rem;
    text-align: center;
  }

  .app-content {
    padding: 4.2rem 1rem 1rem;
  }

  .utility-bar {
    top: 0.9rem;
    right: 1rem;
    left: 1rem;
    justify-content: flex-end;
  }

  .dashboard-grid,
  .bento-grid {
    grid-template-columns: 1fr;
  }

  .next-meeting,
  .meeting-strip {
    grid-column: auto;
  }

  .meeting-strip,
  .unlock-banner {
    grid-template-columns: 1fr;
  }

  .meeting-strip {
    display: grid;
  }

  .unlock-banner {
    display: grid;
  }

  .inline-unlock {
    grid-template-columns: 1fr;
  }

  .unlock-modal {
    padding: 1.3rem;
  }

  .modal-backdrop {
    align-items: start;
    padding-top: 1rem;
  }

  .lab-grid,
  .state-readout {
    grid-template-columns: 1fr;
  }

  .state-lab summary small {
    display: none;
  }
}
</style>
