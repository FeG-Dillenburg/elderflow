<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import DatePicker from 'primevue/datepicker';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import { api, formatUser, toLocalDate, type AgendaSection, type Topic, type TopicInput, type User } from '../api/domain';
import RichTextEditor from './RichTextEditor.vue';
import { assignableUsers } from '../auth/roles';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ topic: Topic; users: User[]; sections: AgendaSection[] }>();
const emit = defineEmits<{ saved: [] }>();
const visible = defineModel<boolean>('visible', { required: true });
const responsibleUserOptions = computed(() => assignableUsers(props.users));
const { t } = useI18n();
const form = reactive({
  name: '', description: '', type: 'general', status: 'open', followUpDate: null as Date | null,
  responsibleUserId: null as string | null, isRecurring: false, defaultSectionId: null as string | null,
  defaultPosition: null as number | null,
});
const topicTypes = computed(() => ['recurring_agenda', 'person_related', 'prayer_pastoral_care', 'urgent', 'strategic', 'communication', 'appointment_date', 'book_chapter_input', 'general'].map((value) => ({ value, label: t(`topicTypes.${value}`) })));
const statuses = computed(() => ['open', 'done', 'deferred', 'archived'].map((value) => ({ value, label: t(`labels.${value}`) })));

watch(() => props.topic, (topic) => Object.assign(form, {
  name: topic.name,
  description: topic.description,
  type: topic.type,
  status: topic.status,
  followUpDate: topic.followUpDate ? new Date(`${topic.followUpDate}T12:00:00`) : null,
  responsibleUserId: topic.responsibleUserId,
  isRecurring: topic.isRecurring,
  defaultSectionId: topic.defaultSectionId,
  defaultPosition: topic.defaultPosition,
}), { immediate: true });

async function save(): Promise<void> {
  const input: TopicInput = { ...form, followUpDate: toLocalDate(form.followUpDate) };
  await api.updateTopic(props.topic.id, input);
  visible.value = false;
  emit('saved');
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="t('topicEdit.title')" :style="{ width: '46rem', maxWidth: 'calc(100vw - 2rem)' }">
    <form id="edit-topic" class="form" @submit.prevent="save">
      <label><span>{{ t('common.name') }}</span><InputText v-model="form.name" required /></label>
      <label><span>{{ t('topicEdit.background') }}</span><RichTextEditor v-model="form.description" /></label>
      <div class="row">
        <label><span>{{ t('topics.type') }}</span><Select v-model="form.type" :options="topicTypes" option-label="label" option-value="value" /></label>
        <label><span>{{ t('common.status') }}</span><Select v-model="form.status" :options="statuses" option-label="label" option-value="value" /></label>
      </div>
      <div class="row">
        <label><span>{{ t('topicEdit.responsible') }}</span><Select v-model="form.responsibleUserId" :options="responsibleUserOptions" option-label="firstName" option-value="id" show-clear><template #option="{ option }">{{ formatUser(option) }}</template></Select></label>
        <label><span>{{ t('topicEdit.followUpDate') }}</span><DatePicker v-model="form.followUpDate" date-format="yy-mm-dd" show-button-bar /></label>
      </div>
      <label><span>{{ t('topicEdit.defaultSection') }}</span><Select v-model="form.defaultSectionId" :options="sections" option-label="name" option-value="id" show-clear /></label>
      <label class="checkbox"><Checkbox v-model="form.isRecurring" binary /><span>{{ t('topicEdit.autoAdd') }}</span></label>
    </form>
    <template #footer><Button :label="t('common.cancel')" severity="secondary" text @click="visible = false" /><Button :label="t('topicEdit.save')" type="submit" form="edit-topic" /></template>
  </Dialog>
</template>

<style scoped>
.form, .form label { display: grid; gap: .45rem; }.form { gap: 1rem; }.form label > span { font-size: .86rem; font-weight: 650; }.form :deep(input), .form :deep(.p-select), .form :deep(.p-datepicker) { width: 100%; }.row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }.form .checkbox { display: flex; grid-template-columns: auto 1fr; align-items: center; }@media (max-width: 650px) { .row { grid-template-columns: 1fr; } }
</style>
