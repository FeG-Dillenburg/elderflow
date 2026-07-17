<script setup lang="ts">
import {computed, onMounted, reactive, ref} from 'vue';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import {api, type AgendaSection} from '../api/domain';
import {auth} from '../auth/auth';
import {useI18n} from 'vue-i18n';

const canManage = computed(() => !auth.state.user || auth.canManage('contentSettings'));
const sections = ref<AgendaSection[]>([]), error = ref(''), saving = ref(false);
const draft = reactive({name: '', position: 1, isDefault: true});
const {t} = useI18n();
const load = async () => {
  try {
    sections.value = await api.sections()
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('agendaSections.loadFailed')
  }
};
const save = async (section: AgendaSection) => {
  saving.value = true;
  try {
    await api.updateSection(section.id, {name: section.name, position: section.position, isDefault: section.isDefault});
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('agendaSections.saveFailed')
  } finally {
    saving.value = false
  }
};
const create = async () => {
  await api.createSection(draft);
  Object.assign(draft, {name: '', position: sections.value.length + 1, isDefault: true});
  await load()
};
const remove = async (id: string) => {
  try {
    await api.deleteSection(id);
    await load()
  } catch (e) {
    error.value = e instanceof Error && e.message ? e.message : t('agendaSections.deleteFailed')
  }
};
onMounted(load);
</script>
<template>
  <section class="page">
    <header><p class="eyebrow">{{ t('agendaSections.eyebrow') }}</p>
      <h1>{{ t('agendaSections.title') }}</h1>
      <p>{{ t('agendaSections.description') }}</p></header>
    <Message v-if="error" severity="error">{{ error }}</Message>
    <div class="section-list">
      <article v-for="section in sections" :key="section.id">
        <InputNumber v-model="section.position" class="position-input" :min="1" show-buttons/>
        <InputText v-model="section.name"/>
        <label>
          <Checkbox v-model="section.isDefault" binary/>
          {{ t('common.default') }}</label>
        <Button v-if="canManage" icon="pi pi-save" text :aria-label="t('common.save')" :loading="saving" @click="save(section)"/>
        <Button v-if="canManage" icon="pi pi-trash" severity="danger" text :aria-label="t('common.delete')" @click="remove(section.id)"/>
      </article>
      <form v-if="canManage" class="new-section" @submit.prevent="create">
        <InputNumber v-model="draft.position" class="position-input" :min="1"/>
        <InputText v-model="draft.name" :placeholder="t('agendaSections.newName')" required/>
        <label>
          <Checkbox v-model="draft.isDefault" binary/>
          {{ t('common.default') }}</label>
        <Button :label="t('agendaSections.add')" icon="pi pi-plus" type="submit"/>
      </form>
    </div>
  </section>
</template>
<style scoped>.page {
  max-width: 950px;
  margin: 0 auto
}

.eyebrow {
  margin: 0 0 .3rem;
  color: #607dae;
  font-size: .72rem;
  font-weight: 800;
  letter-spacing: .1em;
  text-transform: uppercase
}

h1 {
  margin: 0;
  font-size: 2.2rem;
  letter-spacing: -.04em
}

header > p:last-child {
  margin: .45rem 0 1.5rem;
  color: #68758a
}

.section-list {
  display: grid;
  gap: .55rem
}

.section-list article, .new-section {
  display: grid;
  grid-template-columns:5.5rem minmax(0, 1fr) 120px auto auto;
  align-items: center;
  gap: .65rem;
  padding: .7rem;
  border: 1px solid #e2e6ec;
  border-radius: .7rem;
  background: #fff
}

.position-input {
  width: 100%;
  min-width: 0
}

.position-input :deep(input) {
  width: 100%;
  min-width: 0
}

.section-list label {
  display: flex;
  align-items: center;
  gap: .45rem;
  font-size: .84rem
}

.new-section {
  margin-top: .6rem;
  background: #eef3fa
}

@media (max-width: 700px) {
  .section-list article, .new-section {
    grid-template-columns:5.5rem minmax(0, 1fr)
  }

  .section-list label {
    grid-column: span 2
  }
}</style>
