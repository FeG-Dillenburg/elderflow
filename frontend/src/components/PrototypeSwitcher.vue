<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";

const props = defineProps<{
  variants: Array<{
    key: string;
    name: string;
  }>;
}>();

const route = useRoute();
const router = useRouter();
const visible = import.meta.env.DEV;
const currentIndex = computed(() => {
  const index = props.variants.findIndex(
    (variant) => variant.key === route.query.variant,
  );
  return index >= 0 ? index : 0;
});
const current = computed(() => props.variants[currentIndex.value]);

async function move(offset: number): Promise<void> {
  const next =
    (currentIndex.value + offset + props.variants.length) %
    props.variants.length;
  await router.replace({
    query: {
      ...route.query,
      variant: props.variants[next]?.key,
    },
  });
}

function onKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  if (
    target?.matches("input, textarea, select, [contenteditable='true']")
  ) {
    return;
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    void move(-1);
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    void move(1);
  }
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <div v-if="visible && current" class="prototype-switcher">
    <button
      type="button"
      aria-label="Previous prototype variant"
      @click="move(-1)"
    >
      <i class="pi pi-arrow-left" aria-hidden="true" />
    </button>
    <span>
      <small>PROTOTYPE VARIANT</small>
      <strong>{{ current.key }} — {{ current.name }}</strong>
    </span>
    <button
      type="button"
      aria-label="Next prototype variant"
      @click="move(1)"
    >
      <i class="pi pi-arrow-right" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.prototype-switcher {
  position: fixed;
  z-index: 100;
  bottom: 1rem;
  left: 50%;
  display: grid;
  grid-template-columns: 2.75rem minmax(12rem, auto) 2.75rem;
  align-items: center;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 999px;
  background: #111827;
  box-shadow: 0 14px 40px rgb(15 23 42 / 30%);
  color: #fff;
  transform: translateX(-50%);
}

.prototype-switcher button {
  align-self: stretch;
  border: 0;
  background: transparent;
  color: #fff;
  cursor: pointer;
}

.prototype-switcher button:hover {
  background: rgb(255 255 255 / 12%);
}

.prototype-switcher span {
  display: grid;
  padding: 0.55rem 0.8rem;
  text-align: center;
}

.prototype-switcher small {
  color: #a7b4c8;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.prototype-switcher strong {
  font-size: 0.78rem;
}

@media (max-width: 520px) {
  .prototype-switcher {
    bottom: 0.65rem;
    width: calc(100% - 1rem);
    grid-template-columns: 2.5rem 1fr 2.5rem;
  }
}
</style>
