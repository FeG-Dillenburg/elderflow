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

const props = defineProps<{ topic: Topic; users: User[]; sections: AgendaSection[] }>();
const emit = defineEmits<{ saved: [] }>();
const visible = defineModel<boolean>('visible', { required: true });
const responsibleUserOptions = computed(() => assignableUsers(props.users));
const form = reactive({
  name: '', description: '', type: 'general', status: 'open', followUpDate: null as Date | null,
  responsibleUserId: null as string | null, isRecurring: false, defaultSectionId: null as string | null,
  defaultPosition: null as number | null,
});
const topicTypes = ['recurring_agenda', 'person_related', 'prayer_pastoral_care', 'urgent', 'strategic', 'communication', 'appointment_date', 'book_chapter_input', 'general'];

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
  <Dialog v-model:visible="visible" modal header="Edit topic" :style="{ width: '46rem', maxWidth: 'calc(100vw - 2rem)' }">
    <form id="edit-topic" class="form" @submit.prevent="save">
      <label><span>Name</span><InputText v-model="form.name" required /></label>
      <label><span>Description / background</span><RichTextEditor v-model="form.description" /></label>
      <div class="row">
        <label><span>Type</span><Select v-model="form.type" :options="topicTypes" /></label>
        <label><span>Status</span><Select v-model="form.status" :options="['open', 'done', 'deferred', 'archived']" /></label>
      </div>
      <div class="row">
        <label><span>Responsible</span><Select v-model="form.responsibleUserId" :options="responsibleUserOptions" option-label="firstName" option-value="id" show-clear><template #option="{ option }">{{ formatUser(option) }}</template></Select></label>
        <label><span>Follow-up date</span><DatePicker v-model="form.followUpDate" date-format="yy-mm-dd" show-button-bar /></label>
      </div>
      <label><span>Default section</span><Select v-model="form.defaultSectionId" :options="sections" option-label="name" option-value="id" show-clear /></label>
      <label class="checkbox"><Checkbox v-model="form.isRecurring" binary /><span>Add automatically to new meetings</span></label>
    </form>
    <template #footer><Button label="Cancel" severity="secondary" text @click="visible = false" /><Button label="Save topic" type="submit" form="edit-topic" /></template>
  </Dialog>
</template>

<style scoped>
.form, .form label { display: grid; gap: .45rem; }.form { gap: 1rem; }.form label > span { font-size: .86rem; font-weight: 650; }.form :deep(input), .form :deep(.p-select), .form :deep(.p-datepicker) { width: 100%; }.row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }.form .checkbox { display: flex; grid-template-columns: auto 1fr; align-items: center; }@media (max-width: 650px) { .row { grid-template-columns: 1fr; } }
</style>
