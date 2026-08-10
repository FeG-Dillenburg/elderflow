<script lang="ts" setup>
import { computed } from "vue";
import { RouterLink, RouterView } from "vue-router";
import { formatUser, type PermissionCategory } from "./api/domain";
import { auth } from "./auth/auth";
import { roleLabel } from "./auth/roles";
import router from "./router";
import { useI18n } from "vue-i18n";
import UnlockDialog from "./e2ee/UnlockDialog.vue";
import { protectedText } from "./e2ee/protected-text";

const { t } = useI18n();
const navigation: Array<{
  to: string;
  icon: string;
  labelKey: string;
  permission: PermissionCategory;
}> = [
  {
    to: "/",
    icon: "pi-home",
    labelKey: "nav.dashboard",
    permission: "dashboard",
  },
  {
    to: "/meetings",
    icon: "pi-calendar",
    labelKey: "nav.meetings",
    permission: "meetings",
  },
  {
    to: "/topics",
    icon: "pi-comments",
    labelKey: "nav.topics",
    permission: "topics",
  },
  {
    to: "/tasks",
    icon: "pi-check-square",
    labelKey: "nav.tasks",
    permission: "tasks",
  },
  {
    to: "/users",
    icon: "pi-users",
    labelKey: "nav.users",
    permission: "users",
  },
  {
    to: "/agenda-sections",
    icon: "pi-list",
    labelKey: "nav.sections",
    permission: "contentSettings",
  },
];
const visibleNavigation = computed(() =>
  navigation.filter((item) => auth.canView(item.permission)),
);
const isSetupRoute = computed(() => router.currentRoute.value.name === "setup");
const protectedRouteKey = computed(
  () => `${router.currentRoute.value.fullPath}:${protectedText.state.status}`,
);

async function logout(): Promise<void> {
  auth.logout();
  await router.push("/login");
}
</script>

<template>
  <div v-if="auth.state.user && !isSetupRoute" class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <img
          class="brand-icon"
          src="/elderflow-logo.svg"
          alt=""
          aria-hidden="true"
        />
        <img
          class="brand-wordmark"
          src="/elderflow-wordmark-white.png"
          :alt="t('brand.name')"
        />
      </div>
      <nav :aria-label="t('nav.main')">
        <RouterLink
          v-for="item in visibleNavigation"
          :key="item.to"
          :to="item.to"
          class="nav-link"
        >
          <i :class="item.icon" aria-hidden="true" class="pi" />
          {{ t(item.labelKey) }}
        </RouterLink>
        <RouterLink
          v-if="protectedText.isEligible(auth.state.user)"
          to="/key-recovery"
          class="nav-link"
        >
          <i class="pi pi-key" aria-hidden="true" />
          {{ t("e2ee.recoveryAction") }}
        </RouterLink>
      </nav>
      <div class="current-user">
        <RouterLink to="/profile" class="profile-link">
          <span class="avatar">
            {{ auth.state.user.firstName[0] }}{{ auth.state.user.lastName[0] }}
          </span>
          <span>
            <strong>{{ formatUser(auth.state.user) }}</strong>
            <small>{{ roleLabel(auth.state.user.role) }}</small>
          </span>
        </RouterLink>
        <button
          class="logout-button"
          type="button"
          :title="t('nav.signOut')"
          :aria-label="t('nav.signOut')"
          @click="logout"
        >
          <i class="pi pi-sign-out" aria-hidden="true" />
        </button>
      </div>
    </aside>
    <main class="main-content">
      <div
        v-if="protectedText.isEligible(auth.state.user)"
        class="protected-text-status"
      >
        <span
          class="status-indicator"
          :class="`status-${protectedText.state.status}`"
          role="status"
        >
          {{
            protectedText.state.status === "unlocked"
              ? t("e2ee.unlocked")
              : t("e2ee.locked")
          }}
        </span>
        <button
          v-if="protectedText.isEligible(auth.state.user)"
          type="button"
          class="lock-button"
          @click="
            protectedText.state.status === 'unlocked'
              ? protectedText.lock('explicit')
              : protectedText.showUnlock()
          "
        >
          {{
            protectedText.state.status === "unlocked"
              ? t("e2ee.lockAction")
              : t("e2ee.unlockAction")
          }}
        </button>
      </div>
      <RouterView :key="protectedRouteKey" />
    </main>
    <UnlockDialog v-if="protectedText.isEligible(auth.state.user)" />
  </div>
  <RouterView v-else />
</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

:global(body) {
  margin: 0;
  min-width: 320px;
  background: #f5f6f8;
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

:global(a) {
  color: inherit;
}

.app-shell {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 1.5rem 1rem;
  background: #18253c;
  color: #fff;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0 0.55rem 2rem;
  font-size: 1.18rem;
  font-weight: 750;
}

.brand-icon {
  width: 2.1rem;
  height: 2.1rem;
}

.brand-wordmark {
  width: 7rem;
  height: auto;
}

nav {
  display: grid;
  min-height: 0;
  gap: 0.3rem;
  overflow-y: auto;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.78rem 0.9rem;
  border-radius: 0.6rem;
  color: #dce5f4;
  text-decoration: none;
}

.nav-link:hover,
.nav-link.router-link-exact-active {
  background: rgb(255 255 255 / 10%);
  color: #fff;
}

.current-user {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.7rem;
  margin-top: auto;
  padding: 0.9rem 0.55rem 0;
  border-top: 1px solid rgb(255 255 255 / 12%);
}

.profile-link {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 0.7rem;
  color: inherit;
  text-decoration: none;
}

.logout-button {
  padding: 0.4rem;
  border: 0;
  background: transparent;
  color: #aebbd0;
  cursor: pointer;
}

.logout-button:hover {
  color: #fff;
}

.current-user strong,
.current-user small {
  display: block;
}

.current-user strong {
  font-size: 0.86rem;
}

.current-user small {
  margin-top: 0.15rem;
  color: #aebbd0;
  font-size: 0.7rem;
}

.avatar {
  display: grid;
  flex: 0 0 auto;
  width: 2.2rem;
  height: 2.2rem;
  place-items: center;
  border-radius: 50%;
  background: #e9eef8;
  color: #273956;
  font-size: 0.75rem;
  font-weight: 800;
}

.main-content {
  min-width: 0;
  padding: 2.25rem;
}

.protected-text-status {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: 1rem;
}

.status-indicator {
  font-size: 0.8rem;
  font-weight: 700;
}

.status-unlocked {
  color: #177245;
}

.lock-button {
  border: 0;
  background: transparent;
  color: #334155;
  text-decoration: underline;
  cursor: pointer;
}

@media (max-width: 760px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: static;
    height: auto;
  }

  .brand {
    margin-bottom: 1rem;
  }

  nav {
    grid-template-columns: repeat(2, 1fr);
  }

  .current-user {
    display: none;
  }

  .main-content {
    padding: 1rem;
  }
}
</style>
