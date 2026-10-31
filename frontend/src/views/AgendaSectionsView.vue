<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import { useI18n } from "vue-i18n";
import { api, type AgendaSection } from "../api/domain";
import { auth } from "../auth/auth";
import { canonicalTopicTypes, topicTypeTranslationKey, type TopicType } from "../topics/topicTypes";
import { usePreparationDrag } from "../meetings/usePreparationDrag";

const { t } = useI18n();
const canManage = computed(() => auth.canManage("contentSettings"));
const sections = ref<AgendaSection[]>([]);
const error = ref("");
const saving = ref(false);
const loading = ref(true);
const orderReady = ref(false);
const visible = ref(false);
const editingId = ref<string | null>(null);
const draft = reactive({ name: "", defaultTopicType: null as TopicType | null });
const list = ref<HTMLElement | null>(null);
const disabled = computed(() => !canManage.value || saving.value || loading.value || !orderReady.value);
const typeOptions = computed(() => canonicalTopicTypes.map((value) => ({
  value,
  label: t(topicTypeTranslationKey(value)),
  disabled: sections.value.some((section) => section.id !== editingId.value && section.defaultTopicType === value),
})));

const load = async () => {
  loading.value = true;
  try {
    sections.value = await api.sections();
    orderReady.value = true;
  } catch (e) {
    orderReady.value = false;
    error.value = e instanceof Error && e.message ? e.message : t("agendaSections.loadFailed");
  } finally {
    loading.value = false;
  }
};
const open = (section?: AgendaSection) => {
  if (disabled.value) return;
  editingId.value = section?.id ?? null;
  Object.assign(draft, { name: section?.name ?? "", defaultTopicType: section?.defaultTopicType ?? null });
  error.value = "";
  visible.value = true;
};
const save = async () => {
  if (disabled.value || !draft.name.trim()) return;
  saving.value = true;
  error.value = "";
  try {
    const input = { name: draft.name.trim(), defaultTopicType: draft.defaultTopicType };
    if (editingId.value) await api.updateSection(editingId.value, input);
    else await api.createSection(input);
    visible.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error && e.message ? e.message : t("agendaSections.saveFailed");
    await load();
  } finally {
    saving.value = false;
  }
};
const remove = async (id: string) => {
  if (disabled.value) return;
  saving.value = true;
  error.value = "";
  try {
    await api.deleteSection(id);
    await load();
  } catch (e) {
    error.value = e instanceof Error && e.message ? e.message : t("agendaSections.deleteFailed");
  } finally {
    saving.value = false;
  }
};
const reorder = async (ordered: AgendaSection[]) => {
  if (disabled.value) return false;
  const previous = sections.value;
  sections.value = ordered;
  saving.value = true;
  error.value = "";
  try {
    sections.value = await api.reorderSections(ordered.map((section) => section.id));
    return true;
  } catch (e) {
    sections.value = previous;
    error.value = e instanceof Error && e.message ? e.message : t("agendaSections.reorderFailed");
    await load();
    return false;
  } finally {
    saving.value = false;
  }
};
const move = (index: number, offset: number) => {
  const ordered = [...sections.value];
  const destination = index + offset;
  if (destination < 0 || destination >= ordered.length) return;
  const [section] = ordered.splice(index, 1);
  ordered.splice(destination, 0, section!);
  return reorder(ordered);
};
const { floating, pointer, target, start } = usePreparationDrag(list, disabled, async (source, destination) => {
  const ordered = sections.value.filter((section) => section.id !== source.id);
  const section = sections.value.find((section) => section.id === source.id);
  if (!section) return false;
  ordered.splice(destination.index, 0, section);
  return reorder(ordered);
});
const dropBefore = (id: string) => {
  const remaining = sections.value.filter((section) => section.id !== floating.value?.id);
  return floating.value && target.value?.index === remaining.findIndex((section) => section.id === id);
};
onMounted(load);
</script>

<template>
  <section ref="list" class="page">
    <header>
      <p class="eyebrow">{{ t("agendaSections.eyebrow") }}</p>
      <h1>{{ t("agendaSections.title") }}</h1>
      <p>{{ t("agendaSections.description") }}</p>
    </header>
    <Message v-if="error && !visible" severity="error" role="alert">{{ error }}</Message>
    <p v-if="loading" role="status">{{ t("agendaSections.loading") }}</p>
    <Button
      v-if="!orderReady && !loading"
      :label="t('agendaSections.retry')"
      @click="load"
    />
    <Button
      v-if="canManage"
      :label="t('agendaSections.add')"
      :aria-label="t('agendaSections.add')"
      icon="pi pi-plus"
      :disabled="disabled"
      @click="open()"
    />
    <div class="section-list" data-agenda-section="sections" :aria-busy="saving">
      <article
        v-for="(section, index) in sections"
        :key="section.id"
        :data-agenda-item="section.id"
        :class="{ 'drop-before': dropBefore(section.id), 'drag-source': floating?.id === section.id }"
      >
        <button
          v-if="canManage"
          type="button"
          class="drag-handle"
          :disabled="disabled"
          :aria-label="t('agendaSections.drag', { name: section.name })"
          @pointerdown="start($event, { kind: 'agenda', id: section.id, title: section.name })"
          @dragstart.prevent
        >
          <i class="pi pi-bars" aria-hidden="true" />
        </button>
        <strong>{{ section.name }}</strong>
        <span v-if="section.defaultTopicType" class="type-badge">
          {{ t(topicTypeTranslationKey(section.defaultTopicType)) }}
        </span>
        <div v-if="canManage" class="actions">
          <Button
            icon="pi pi-arrow-up"
            text
            :aria-label="t('agendaSections.moveUp', { name: section.name })"
            :disabled="disabled || index === 0"
            @click="move(index, -1)"
          />
          <Button
            icon="pi pi-arrow-down"
            text
            :aria-label="t('agendaSections.moveDown', { name: section.name })"
            :disabled="disabled || index === sections.length - 1"
            @click="move(index, 1)"
          />
          <Button
            icon="pi pi-pencil"
            text
            :aria-label="t('agendaSections.editAction', { name: section.name })"
            :disabled="disabled"
            @click="open(section)"
          />
          <Button
            icon="pi pi-trash"
            severity="danger"
            text
            :aria-label="t('agendaSections.deleteAction', { name: section.name })"
            :disabled="disabled"
            @click="remove(section.id)"
          />
        </div>
      </article>
      <div
        v-if="floating && target?.index === sections.length - 1"
        class="drop-end"
        aria-hidden="true"
      />
    </div>
    <p v-if="!loading && !sections.length">{{ t("agendaSections.empty") }}</p>
    <p v-if="saving" role="status">{{ t("agendaSections.saving") }}</p>
    <div
      v-if="floating"
      class="drag-preview"
      :style="{ left: `${pointer.x + 16}px`, top: `${pointer.y + 16}px` }"
      aria-hidden="true"
    >
      {{ floating.title }}
    </div>
    <Dialog
      v-model:visible="visible"
      modal
      :header="t(editingId ? 'agendaSections.edit' : 'agendaSections.add')"
      :closable="!saving"
      :close-on-escape="!saving"
      :style="{ width: '30rem', maxWidth: 'calc(100vw - 2rem)' }"
    >
      <form class="section-form" @submit.prevent="save">
        <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
        <label for="section-name">{{ t("common.name") }}</label>
        <InputText
          id="section-name"
          v-model="draft.name"
          name="section-name"
          autofocus
          required
          :disabled="saving"
        />
        <label for="section-type">{{ t("agendaSections.defaultTopicType") }}</label>
        <Select
          v-model="draft.defaultTopicType"
          input-id="section-type"
          :options="typeOptions"
          option-label="label"
          option-value="value"
          option-disabled="disabled"
          show-clear
          :disabled="saving"
          :placeholder="t('agendaSections.noType')"
        />
        <div class="dialog-actions">
          <Button
            :label="t('common.cancel')"
            :aria-label="t('common.cancel')"
            severity="secondary"
            :disabled="saving"
            @click="visible = false"
          />
          <Button
            type="submit"
            :label="t('common.save')"
            :loading="saving"
            :disabled="disabled || !draft.name.trim()"
          />
        </div>
      </form>
    </Dialog>
  </section>
</template>

<style scoped>
.page {
  max-width: 950px;
  margin: 0 auto;
}

.eyebrow {
  margin: 0 0 0.3rem;
  color: #607dae;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: 2.2rem;
  letter-spacing: -0.04em;
}

header > p:last-child {
  margin: 0.45rem 0 1.5rem;
  color: #68758a;
}

.section-list {
  display: grid;
  gap: 0.55rem;
  margin-top: 1rem;
}

.section-list article {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.65rem;
  padding: 0.7rem;
  border: 1px solid #e2e6ec;
  border-radius: 0.7rem;
  background: #fff;
}

.actions {
  display: flex;
  margin-left: auto;
}

.type-badge {
  padding: 0.2rem 0.5rem;
  border-radius: 0.4rem;
  background: #eef3fa;
  font-size: 0.84rem;
}

.drag-handle {
  touch-action: none;
  cursor: grab;
  border: none;
  background: transparent;
  padding: 0.5rem;
  color: inherit;
}

.drag-handle:disabled {
  cursor: default;
  opacity: 0.5;
}

.drag-source {
  opacity: 0.45;
}

.section-list .drop-before {
  border-top: 3px solid var(--p-primary-color);
}

.drop-end {
  border-top: 3px solid var(--p-primary-color);
}

.drag-preview {
  position: fixed;
  z-index: 3000;
  pointer-events: none;
  background: var(--p-content-background);
  border: 1px solid var(--p-primary-color);
  border-radius: 0.7rem;
  padding: 0.7rem;
  box-shadow: 0 0.5rem 1.5rem #0002;
}

.section-form {
  display: grid;
  gap: 0.65rem;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.65rem;
  margin-top: 1rem;
}
</style>
