<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { api } from "../api/domain";
import { INSTALLATION_REQUEST_TIMEOUT_MS } from "../installation";

const emit = defineEmits<{ ready: [] }>();
const { t } = useI18n();
const cubes = Array.from({ length: 27 }, (_, index) => ({
  height: Math.floor(index / 9) + 1,
  width: Math.floor((index % 9) / 3) + 1,
  length: (index % 3) + 1,
}));
let interval: ReturnType<typeof setInterval> | undefined;
let pending: AbortController | null = null;
let disposed = false;
let ready = false;

async function checkBackend() {
  if (pending || ready || disposed) return;
  const controller = new AbortController();
  pending = controller;
  const timeout = setTimeout(() => controller.abort(), INSTALLATION_REQUEST_TIMEOUT_MS);
  try {
    await api.installation({ signal: controller.signal });
    if (disposed || controller.signal.aborted) return;
    ready = true;
    clearInterval(interval);
    emit("ready");
  } catch {
    // Startup is expected to fail until the API has finished booting.
  } finally {
    clearTimeout(timeout);
    pending = null;
  }
}

onMounted(() => {
  interval = setInterval(() => { void checkBackend(); }, 2000);
});
onBeforeUnmount(() => {
  disposed = true;
  clearInterval(interval);
  pending?.abort();
});
</script>

<template>
  <main class="startup-screen">
    <div class="startup-content">
      <img
        class="startup-wordmark"
        src="/elderflow-wordmark-color.png"
        :alt="t('brand.name')"
      />
      <div class="animation-stage" aria-hidden="true">
        <!-- Cube choreography adapted from https://codepen.io/cssinate/pen/vXEwmX -->
        <div class="cube-animation">
          <div
            v-for="(cube, index) in cubes"
            :key="index"
            class="cube"
            :style="{ '--h': cube.height, '--w': cube.width, '--l': cube.length }"
          >
            <div class="face top" />
            <div class="face left" />
            <div class="face right" />
          </div>
        </div>
      </div>
      <div role="status" aria-live="polite">
        <h1>{{ t("startup.title") }}</h1>
        <p>{{ t("startup.waiting") }}</p>
      </div>
    </div>
  </main>
</template>

<style scoped>
.startup-screen {
  display: grid;
  min-height: 100vh;
  min-height: 100dvh;
  place-items: center;
  padding: 2rem 1rem;
  background: radial-gradient(ellipse at top, #fff, #eef2f7 70%);
  color: #18253c;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  text-align: center;
}

.startup-content {
  width: min(100%, 32rem);
}

.startup-wordmark {
  display: block;
  width: min(16rem, 75%);
  height: auto;
  margin: 0 auto;
  mix-blend-mode: multiply;
}

.animation-stage {
  display: grid;
  height: 17rem;
  place-items: center;
}

.cube-animation {
  position: relative;
  isolation: isolate;
  width: 86px;
  height: 100px;
  transform: scale(0.5);
}

.cube {
  position: absolute;
  z-index: calc(-1 * var(--h));
  width: 86px;
  height: 100px;
  animation: assemble 3s ease infinite;
}

.face {
  position: absolute;
  width: 50px;
  height: 50px;
  transform-origin: 0 0;
}

.top {
  z-index: 2;
  background: #57bfc1;
  transform: rotate(210deg) skew(-30deg) translate(-75px, -22px) scaleY(0.86);
}

.left {
  background: #315f9f;
  transform: rotate(90deg) skewX(-30deg) scaleY(0.86) translate(25px, -50px);
}

.right {
  background: #18253c;
  transform: rotate(-30deg) skewX(-30deg) translate(49px, 65px) scaleY(0.86);
}

@keyframes assemble {
  0%, 85%, 100% {
    transform: translate(
      calc((var(--l) - var(--w)) * 50%),
      calc(var(--h) * 50% + var(--w) * 25% + var(--l) * 25% - 200%)
    );
  }
  14% {
    transform: translate(
      calc(var(--w) * -50% + var(--l) * 100% - 100%),
      calc(var(--h) * 50% + var(--w) * 25% + var(--l) * 50% - 250%)
    );
  }
  28% {
    transform: translate(
      calc((var(--l) - var(--w)) * 100%),
      calc(var(--h) * 50% + var(--w) * 50% + var(--l) * 50% - 300%)
    );
  }
  43% {
    transform: translate(
      calc((var(--l) - var(--w)) * 100%),
      calc(var(--h) * 100% + var(--w) * 50% + var(--l) * 50% - 400%)
    );
  }
  57% {
    transform: translate(
      calc(var(--w) * -100% + var(--l) * 50% + 100%),
      calc(var(--h) * 100% + var(--w) * 50% + var(--l) * 25% - 350%)
    );
  }
  71% {
    transform: translate(
      calc((var(--l) - var(--w)) * 50%),
      calc(var(--h) * 100% + var(--w) * 25% + var(--l) * 25% - 300%)
    );
  }
}

h1 {
  margin: 0;
  font-size: clamp(1.4rem, 5vw, 1.8rem);
  font-weight: 700;
  letter-spacing: -0.025em;
}

p {
  margin: 0.75rem auto 0;
  max-width: 26rem;
  color: #64748b;
  line-height: 1.6;
}

@media (prefers-reduced-motion: reduce) {
  .cube {
    animation: none;
    transform: translate(
      calc((var(--l) - var(--w)) * 50%),
      calc(var(--h) * 50% + var(--w) * 25% + var(--l) * 25% - 200%)
    );
  }
}
</style>
