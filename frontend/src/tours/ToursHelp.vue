<script setup lang="ts">
import { computed, ref } from "vue";
import Dialog from "primevue/dialog";
import Button from "primevue/button";
import { useI18n } from "vue-i18n";
import { auth } from "../auth/auth";
import { tours } from "./tours";
import { tourRegistry, type TourId } from "./registry";

const { t } = useI18n();
const visible = ref(false);
const available = computed(() => Object.values(tourRegistry).filter(
  (definition) => auth.state.user && definition.audience(auth.state.user),
));
async function replay(id: TourId): Promise<void> {
  visible.value = false;
  await tours.replay(id);
}
</script>

<template>
  <button
    v-if="available.length"
    type="button"
    data-tour-id="tours-help"
    class="tours-help"
    :disabled="Boolean(tours.state.activeId)"
    @click="visible = true"
  >
    <i class="pi pi-question-circle" aria-hidden="true" />
    {{ t("tours.help") }}
  </button>
  <Dialog v-model:visible="visible" modal :header="t('tours.help')">
    <p>{{ t("tours.replayDescription") }}</p>
    <div class="tour-list">
      <Button
        v-for="definition in available"
        :key="definition.id"
        :label="t(definition.nameKey)"
        @click="replay(definition.id)"
      />
    </div>
  </Dialog>
</template>

<style scoped>
.tours-help {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.78rem 0.9rem;
  border: 0;
  border-radius: 0.6rem;
  background: transparent;
  color: #dce5f4;
  font: inherit;
  text-align: left;
}
.tours-help:hover { background: rgb(255 255 255 / 10%); }
.tour-list { display: flex; flex-wrap: wrap; gap: 0.75rem; }
</style>
