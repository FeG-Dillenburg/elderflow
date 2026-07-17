<script lang="ts" setup>
import { computed } from 'vue';
import {RouterLink, RouterView} from 'vue-router';
import { formatUser, type PermissionCategory } from './api/domain';
import { auth } from './auth/auth';
import { roleLabel } from './auth/roles';
import router from './router';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const navigation: Array<{ to: string; icon: string; labelKey: string; permission: PermissionCategory }> = [
  {to: '/', icon: 'pi-home', labelKey: 'nav.dashboard', permission: 'dashboard'},
  {to: '/meetings', icon: 'pi-calendar', labelKey: 'nav.meetings', permission: 'meetings'},
  {to: '/topics', icon: 'pi-comments', labelKey: 'nav.topics', permission: 'topics'},
  {to: '/tasks', icon: 'pi-check-square', labelKey: 'nav.tasks', permission: 'tasks'},
  {to: '/users', icon: 'pi-users', labelKey: 'nav.users', permission: 'users'},
  {to: '/agenda-sections', icon: 'pi-list', labelKey: 'nav.sections', permission: 'contentSettings'},
];
const visibleNavigation = computed(() => navigation.filter((item) => auth.canView(item.permission)));
const isSetupRoute = computed(() => router.currentRoute.value.name === 'setup');

async function logout(): Promise<void> {
  auth.logout();
  await router.push('/login');
}
</script>

<template>
  <div v-if="auth.state.user && !isSetupRoute" class="app-shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">E</span><span>ElderFlow</span></div>
      <nav :aria-label="t('nav.main')">
        <RouterLink v-for="item in visibleNavigation" :key="item.to" :to="item.to" class="nav-link">
          <i :class="item.icon" aria-hidden="true" class="pi"/>{{ t(item.labelKey) }}
        </RouterLink>
      </nav>
      <div class="current-user">
        <RouterLink to="/profile" class="profile-link">
          <span class="avatar">{{ auth.state.user.firstName[0] }}{{ auth.state.user.lastName[0] }}</span>
          <span><strong>{{ formatUser(auth.state.user) }}</strong><small>{{ roleLabel(auth.state.user.role) }}</small></span>
        </RouterLink>
        <button class="logout-button" type="button" :title="t('nav.signOut')" :aria-label="t('nav.signOut')" @click="logout">
          <i class="pi pi-sign-out" aria-hidden="true" />
        </button>
      </div>
    </aside>
    <main class="main-content">
      <RouterView/>
    </main>
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
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
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
  gap: .75rem;
  margin: 0 .55rem 2rem;
  font-size: 1.18rem;
  font-weight: 750;
}

.brand-mark {
  display: grid;
  width: 2.1rem;
  height: 2.1rem;
  place-items: center;
  border-radius: .65rem;
  background: #7094d6;
}

nav {
  display: grid;
  gap: .3rem;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: .75rem;
  padding: .78rem .9rem;
  border-radius: .6rem;
  color: #dce5f4;
  text-decoration: none;
}

.nav-link:hover, .nav-link.router-link-exact-active {
  background: rgb(255 255 255 / 10%);
  color: #fff;
}

.current-user {
  display: flex;
  align-items: center;
  gap: .7rem;
  margin-top: auto;
  padding: .9rem .55rem 0;
  border-top: 1px solid rgb(255 255 255 / 12%);
}

.profile-link {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: .7rem;
  color: inherit;
  text-decoration: none;
}

.logout-button {
  padding: .4rem;
  border: 0;
  background: transparent;
  color: #aebbd0;
  cursor: pointer;
}

.logout-button:hover { color: #fff; }

.current-user strong, .current-user small {
  display: block;
}

.current-user strong {
  font-size: .86rem;
}

.current-user small {
  margin-top: .15rem;
  color: #aebbd0;
  font-size: .7rem;
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
  font-size: .75rem;
  font-weight: 800;
}

.main-content {
  min-width: 0;
  padding: 2.25rem;
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
