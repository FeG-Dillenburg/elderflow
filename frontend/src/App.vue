<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">E</span>
        <span>Elderflow</span>
      </div>
      <nav aria-label="Main navigation">
        <RouterLink to="/users" class="nav-link">
          <i class="pi pi-users" aria-hidden="true" />
          Users
        </RouterLink>
      </nav>
    </aside>
    <main class="main-content">
      <RouterView />
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
  background: #f7f8fa;
  color: #1f2937;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.app-shell {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  padding: 1.5rem 1rem;
  background: #17233c;
  color: #fff;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0 0.5rem 2rem;
  font-size: 1.15rem;
  font-weight: 700;
}

.brand-mark {
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border-radius: 0.6rem;
  background: #5b8def;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.8rem 0.9rem;
  border-radius: 0.6rem;
  color: #dbe5f7;
  text-decoration: none;
}

.nav-link.router-link-active {
  background: rgb(255 255 255 / 10%);
  color: #fff;
}

.main-content {
  min-width: 0;
  padding: 2rem;
}

@media (max-width: 700px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    padding: 1rem;
  }

  .brand {
    margin-bottom: 1rem;
  }

  .main-content {
    padding: 1rem;
  }
}
</style>

