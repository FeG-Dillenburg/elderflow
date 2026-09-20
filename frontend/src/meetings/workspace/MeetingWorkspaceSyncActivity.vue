<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps<{
  activity: number;
  suppressed?: boolean;
}>();

const stepDegrees = 32;
const idleDelayMs = 2_000;
const fadeDurationMs = 400;

const visible = ref(false);
const fading = ref(false);
const rotation = ref(0);
let previousActivity = props.activity;
let fadeTimer: ReturnType<typeof setTimeout> | undefined;
let removalTimer: ReturnType<typeof setTimeout> | undefined;

const clearTimers = () => {
  if (fadeTimer !== undefined) clearTimeout(fadeTimer);
  if (removalTimer !== undefined) clearTimeout(removalTimer);
  fadeTimer = undefined;
  removalTimer = undefined;
};

watch(() => props.suppressed, (suppressed) => {
  if (!suppressed) return;
  clearTimers();
  visible.value = false;
  fading.value = false;
});

watch(() => props.activity, (activity) => {
  const steps = Math.max(1, activity - previousActivity);
  previousActivity = activity;
  if (props.suppressed) return;
  rotation.value += steps * stepDegrees;
  clearTimers();
  visible.value = true;
  fading.value = false;
  fadeTimer = setTimeout(() => {
    fading.value = true;
    removalTimer = setTimeout(() => {
      visible.value = false;
      fading.value = false;
    }, fadeDurationMs);
  }, idleDelayMs);
});

onBeforeUnmount(clearTimers);

const style = computed(() => ({
  "--sync-rotation": `${rotation.value}deg`,
}));
</script>

<template>
  <svg
    class="workspace-sync-activity"
    :class="{
      'is-visible': visible,
      'is-fading': fading,
    }"
    :style="style"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 240 180"
    fill="none"
    aria-hidden="true"
  >
    <g
      stroke="currentColor"
      stroke-width="3.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path
        d="M 65 146 C 43 146 28 131 28 112 C 28 94 41 79 59 77 C 60 49 80 30 106 30 C 128 30 146 44 152 64 C 157 61 163 60 169 60 C 188 60 203 75 203 94 C 216 98 223 108 223 120 C 223 135 211 146 194 146 Z"
      />
      <g class="sync-arrows">
        <path
          d="M 96.6 91.5 A 27 27 0 0 1 143.4 91.5 L 145.4 95.1 M 145.8 84.7 L 145.4 95.1 L 135.9 90.7"
        />
        <path
          d="M 143.4 118.5 A 27 27 0 0 1 96.6 118.5 L 94.6 114.9 M 94.2 125.3 L 94.6 114.9 L 104.1 119.3"
        />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.workspace-sync-activity {
  width: 2.5rem;
  height: 1.9rem;
  flex: 0 0 auto;
  color: #526176;
  visibility: hidden;
  opacity: 0;
  transition: opacity 400ms ease;
}

.workspace-sync-activity.is-visible {
  visibility: visible;
  opacity: 1;
}

.workspace-sync-activity.is-fading {
  visibility: visible;
  opacity: 0;
}

.sync-arrows {
  transform: rotate(var(--sync-rotation));
  transform-origin: 120px 105px;
  transition: transform 180ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .workspace-sync-activity,
  .sync-arrows {
    transition: none;
  }
}
</style>
