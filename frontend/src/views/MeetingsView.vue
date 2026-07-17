<script lang="ts" setup>
import {computed, onMounted, reactive, ref} from 'vue';
import {useRouter, RouterLink} from 'vue-router';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import DatePicker from 'primevue/datepicker';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import {api, formatUser, meetingLabel, toLocalDate, type Meeting, type MeetingInput, type User} from '../api/domain';
import {auth} from '../auth/auth';
import {assignableUsers} from '../auth/roles';
import {useI18n} from 'vue-i18n';
import {formatDate} from '../i18n';

const canManage = computed(() => !auth.state.user || auth.canManage('meetings'));
const router = useRouter();
const meetings = ref<Meeting[]>([]);
const users = ref<User[]>([]);
const loading = ref(true);
const visible = ref(false);
const saving = ref(false);
const error = ref('');
const {t} = useI18n();
const form = reactive({
  title: '',
  date: null as Date | null,
  beginTime: '19:30',
  status: 'planned',
  meetingLeaderId: null as string | null,
  minuteTakerId: null as string | null
});
const load = async () => {
  loading.value = true;
  try {
    const [loadedMeetings, loadedUsers] = await Promise.all([api.meetings(), api.userDirectory()]);
    meetings.value = loadedMeetings;
    users.value = assignableUsers(loadedUsers);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('meetings.loadFailed');
  } finally {
    loading.value = false;
  }
};
const create = async () => {
  if (!form.date) return;
  saving.value = true;
  try {
    const input: MeetingInput = {
      title: form.title.trim() || null,
      date: toLocalDate(form.date)!,
      beginTime: form.beginTime,
      status: form.status,
      meetingLeaderId: form.meetingLeaderId,
      minuteTakerId: form.minuteTakerId,
      generalNotes: null,
      openingInput: null
    };
    const meeting = await api.createMeeting(input);
    visible.value = false;
    await router.push(`/meetings/${meeting.id}/prepare`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('meetings.createFailed');
  } finally {
    saving.value = false;
  }
};
onMounted(load);
const date = (value: string) => formatDate(`${value}T12:00:00`);
</script>
<template>
  <section class="page">
    <header class="page-header">
      <div><p class="eyebrow">{{ t('meetings.eyebrow') }}</p>
        <h1>{{ t('meetings.title') }}</h1>
        <p>{{ t('meetings.description') }}</p></div>
      <Button v-if="canManage" icon="pi pi-plus" :label="t('meetings.new')" @click="visible = true"/>
    </header>
    <Message v-if="error" severity="error">{{ error }}</Message>
    <div class="table-card">
      <DataTable :loading="loading" :value="meetings" data-key="id">
        <Column :header="t('meetings.meeting')">
          <template #body="{ data }">
            <RouterLink :to="`/meetings/${data.id}`" class="primary-link">{{ meetingLabel(data) }}</RouterLink>
            <small>{{ date(data.date) }} · {{ data.beginTime.slice(0, 5) }}</small></template>
        </Column>
        <Column :header="t('common.status')">
          <template #body="{ data }">
            <Tag :value="t(`labels.${data.status}`)" severity="secondary"/>
          </template>
        </Column>
        <Column :header="t('meetings.leader')">
          <template #body="{ data }">{{ formatUser(data.meetingLeader) }}</template>
        </Column>
        <Column :header="t('meetings.minuteTaker')">
          <template #body="{ data }">{{ formatUser(data.minuteTaker) }}</template>
        </Column>
        <Column>
          <template #body="{ data }">
            <RouterLink v-if="canManage" :to="`/meetings/${data.id}/prepare`">
              <Button icon="pi pi-pencil" :label="t('meetings.prepare')" text/>
            </RouterLink>
            <RouterLink v-else :to="`/meetings/${data.id}`">
              <Button icon="pi pi-eye" :label="t('meetings.openAgenda')" text/>
            </RouterLink>
          </template>
        </Column>
      </DataTable>
    </div>
    <Dialog v-model:visible="visible" :style="{ width: '34rem', maxWidth: 'calc(100vw - 2rem)' }" :header="t('meetings.createTitle')"
            modal>
      <form id="meeting-form" class="form" @submit.prevent="create"><label><span>{{ t('meetings.specialTitle') }} <small>({{ t('common.optional') }})</small></span>
        <InputText v-model="form.title" :placeholder="t('meetings.regularPlaceholder')"/>
      </label>
        <div class="row"><label><span>{{ t('common.date') }}</span>
          <DatePicker v-model="form.date" date-format="yy-mm-dd" required/>
        </label><label><span>{{ t('meetings.beginTime') }}</span>
          <InputText v-model="form.beginTime" required type="time"/>
        </label></div>
        <label><span>{{ t('meetings.meetingLeader') }}</span><Select v-model="form.meetingLeaderId" :options="users"
                                                  option-label="firstName" option-value="id" :placeholder="t('meetings.selectUser')"
                                                  show-clear>
          <template #option="{ option }">{{ formatUser(option) }}</template>
        </Select></label><label><span>{{ t('meetings.minuteTaker') }}</span><Select v-model="form.minuteTakerId" :options="users"
                                                                 option-label="firstName" option-value="id" :placeholder="t('meetings.selectUser')"
                                                                 show-clear>
          <template #option="{ option }">{{ formatUser(option) }}</template>
        </Select></label></form>
      <template #footer>
        <Button :label="t('common.cancel')" severity="secondary" text @click="visible = false"/>
        <Button :loading="saving" form="meeting-form" :label="t('meetings.createAndPrepare')" type="submit"/>
      </template>
    </Dialog>
  </section>
</template>
<style scoped>.page {
  max-width: 1250px;
  margin: 0 auto
}

.page-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem
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

.page-header p:last-child {
  margin: .45rem 0 0;
  color: #68758a
}

.table-card {
  overflow: hidden;
  border: 1px solid #e2e6ec;
  border-radius: .8rem;
  background: #fff
}

.primary-link {
  display: block;
  font-weight: 700;
  text-decoration: none
}

.primary-link + small {
  display: block;
  margin-top: .25rem;
  color: #718096
}

.form, .form label {
  display: grid;
  gap: .45rem
}

.form {
  gap: 1rem
}

.form label > span {
  font-size: .86rem;
  font-weight: 650
}

.form :deep(input), .form :deep(.p-select), .form :deep(.p-datepicker) {
  width: 100%
}

.row {
  display: grid;
  grid-template-columns:1fr 1fr;
  gap: 1rem
}

@media (max-width: 650px) {
  .page-header {
    align-items: stretch;
    flex-direction: column
  }

  .row {
    grid-template-columns:1fr
  }
}</style>
