<script lang="ts" setup>
import {onMounted, ref} from 'vue';
import {RouterLink, RouterView} from 'vue-router';
import {api, formatUser, type User} from './api/domain';

const currentUser = ref<User | null>(null);
onMounted(async () => {
  currentUser.value = await api.me().catch(() => null);
});

const navigation = [
  {to: '/', icon: 'pi-home', label: 'Dashboard'},
  {to: '/meetings', icon: 'pi-calendar', label: 'Meetings'},
  {to: '/topics', icon: 'pi-comments', label: 'Topics'},
  {to: '/tasks', icon: 'pi-check-square', label: 'Open tasks'},
  {to: '/users', icon: 'pi-users', label: 'Users'},
  {to: '/agenda-sections', icon: 'pi-list', label: 'Agenda sections'},
];
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">E</span><span>ElderFlow</span></div>
      <nav aria-label="Main navigation">
        <RouterLink v-for="item in navigation" :key="item.to" :to="item.to" class="nav-link">
          <i :class="item.icon" aria-hidden="true" class="pi"/>{{ item.label }}
        </RouterLink>
      </nav>
      <div v-if="currentUser" class="current-user">
        <span class="avatar">{{ currentUser.firstName[0] }}{{ currentUser.lastName[0] }}</span>
        <span><strong>{{ formatUser(currentUser) }}</strong><small>{{ currentUser.role }} · development</small></span>
      </div>
    </aside>
    <main class="main-content">
      <RouterView/>
    </main>
  </div>
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
