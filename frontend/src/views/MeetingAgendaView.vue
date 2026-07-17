<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import DOMPurify from "dompurify";
import Button from "primevue/button";
import DatePicker from "primevue/datepicker";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Tag from "primevue/tag";
import RichTextEditor from "../components/RichTextEditor.vue";
import { auth } from "../auth/auth";
import { assignableUsers } from "../auth/roles";
import { buildNumberedAgenda } from "../utils/agenda";
import {
  api,
  formatUser,
  meetingLabel,
  toLocalDate,
  type AgendaSection,
  type Meeting,
  type MeetingTopic,
  type TopicInput,
  type User,
} from "../api/domain";
import { useI18n } from "vue-i18n";
import { dateInputFormat, formatDate, formatTime } from "../i18n";

const canManage = computed(
  () => !auth.state.user || auth.canManage("meetings"),
);
const { t } = useI18n();

const route = useRoute();
const id = route.params.id as string;
const meeting = ref<Meeting | null>(null),
  sections = ref<AgendaSection[]>([]),
  users = ref<User[]>([]),
  loading = ref(true),
  error = ref(""),
  participantVisible = ref(false),
  editVisible = ref(false);
const updateEditors = reactive<Record<string, string>>({});
const openEditors = reactive<Record<string, boolean>>({});
const participant = reactive({
  userId: null as string | null,
  attendanceStatus: "present",
});
const editForm = reactive({
  title: "",
  date: null as Date | null,
  beginTime: null as Date | null,
  status: "planned",
  meetingLeaderId: null as string | null,
  minuteTakerId: null as string | null,
  generalNotes: "",
  openingInput: "",
});
const statusOptions = computed(() =>
  ["planned", "in_progress", "completed"].map((value) => ({
    value,
    label: t(`labels.${value}`),
  })),
);
const attendanceOptions = computed(() =>
  ["present", "absent", "excused", "unknown"].map((value) => ({
    value,
    label: t(`labels.${value}`),
  })),
);
const load = async () => {
  loading.value = true;
  try {
    const [loadedMeeting, loadedSections, loadedUsers] = await Promise.all([
      api.meeting(id),
      api.sections(),
      api.userDirectory(),
    ]);
    meeting.value = loadedMeeting;
    sections.value = loadedSections;
    users.value = assignableUsers(loadedUsers);
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : t("meetingAgenda.loadFailed");
  } finally {
    loading.value = false;
  }
};
const grouped = computed(() =>
  buildNumberedAgenda(sections.value, meeting.value?.agenda ?? []),
);
const sectionDuration = (items: MeetingTopic[]) =>
  items.reduce((total, item) => total + (item.plannedDuration ?? 0), 0);
const recent = (item: MeetingTopic) => {
  const cutoff = Date.now() - 14 * 86400000;
  const timestamp = (date: string) => new Date(date).getTime();

  return [...(item.topic?.updates ?? [])]
    .filter((update) => timestamp(update.date) >= cutoff)
    .sort((left, right) => timestamp(right.date) - timestamp(left.date))
    .slice(0, 3)
    .sort((left, right) => timestamp(left.date) - timestamp(right.date));
};
const addUpdate = async (item: MeetingTopic) => {
  const text = updateEditors[item.id];
  if (!text) return;
  await api.addTopicUpdate(item.topicId, {
    text,
    type: "minute",
    meetingId: id,
  });
  updateEditors[item.id] = "";
  openEditors[item.id] = false;
  await load();
};
const openUpdateEditor = (itemId: string) => {
  updateEditors[itemId] ??= "";
  openEditors[itemId] = true;
};
const addParticipant = async () => {
  if (!participant.userId) return;
  await api.addParticipant(id, {
    userId: participant.userId,
    attendanceStatus: participant.attendanceStatus,
  });
  participantVisible.value = false;
  await load();
};
const removeParticipant = async (userId: string) => {
  await api.removeParticipant(id, userId);
  await load();
};
const topicInput = (item: MeetingTopic, status: string): TopicInput => ({
  name: item.topic!.name,
  description: item.topic!.description,
  type: item.topic!.type,
  status,
  followUpDate: item.topic!.followUpDate,
  responsibleUserId: item.topic!.responsibleUserId,
  isRecurring: item.topic!.isRecurring,
  defaultSectionId: item.topic!.defaultSectionId,
  defaultPosition: item.topic!.defaultPosition,
});
const setTopicStatus = async (item: MeetingTopic, status: string) => {
  await api.updateTopic(item.topicId, topicInput(item, status));
  item.status = status === "done" ? "done" : item.status;
  await api.updateMeetingTopic(id, item);
  await load();
};
const toggleDeferred = (item: MeetingTopic) =>
  setTopicStatus(item, item.topic?.status === "deferred" ? "open" : "deferred");
const move = async (
  items: MeetingTopic[],
  index: number,
  direction: -1 | 1,
) => {
  const other = items[index + direction];
  if (!other) return;
  const current = items[index];
  const position = current.position;
  current.position = other.position;
  other.position = position;
  await Promise.all([
    api.updateMeetingTopic(id, current),
    api.updateMeetingTopic(id, other),
  ]);
  await load();
};
const safe = (html: string | null | undefined) =>
  DOMPurify.sanitize(html ?? "");
const hasRichText = (html: string | null | undefined) =>
  (html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .trim().length > 0;
const timeToDate = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
};
const toLocalTime = (value: Date) =>
  `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
const openEdit = () => {
  if (!meeting.value) return;
  Object.assign(editForm, {
    title: meeting.value.title ?? "",
    date: new Date(`${meeting.value.date}T12:00:00`),
    beginTime: timeToDate(meeting.value.beginTime),
    status: meeting.value.status,
    meetingLeaderId: meeting.value.meetingLeaderId,
    minuteTakerId: meeting.value.minuteTakerId,
    generalNotes: meeting.value.generalNotes ?? "",
    openingInput: meeting.value.openingInput ?? "",
  });
  editVisible.value = true;
};
const saveMeeting = async () => {
  if (!meeting.value || !editForm.date || !editForm.beginTime) return;
  await api.updateMeeting(id, {
    title: editForm.title.trim() || null,
    date: toLocalDate(editForm.date)!,
    beginTime: toLocalTime(editForm.beginTime),
    status: editForm.status,
    meetingLeaderId: editForm.meetingLeaderId,
    minuteTakerId: editForm.minuteTakerId,
    generalNotes: editForm.generalNotes || null,
    openingInput: editForm.openingInput || null,
  });
  editVisible.value = false;
  await load();
};
onMounted(load);
</script>
<template>
  <section class="agenda-page">
    <Message v-if="error" severity="error">{{ error }}</Message>
    <template v-if="meeting">
      <header class="meeting-header">
        <div>
          <p class="eyebrow">{{ t("meetingAgenda.eyebrow") }}</p>
          <h1>{{ meetingLabel(meeting) }}</h1>
          <p>
            {{ formatDate(`${meeting.date}T12:00:00`) }} ·
            {{ formatTime(meeting.beginTime) }} ·
            <Tag :value="t(`labels.${meeting.status}`)" severity="secondary" />
          </p>
        </div>
        <div v-if="canManage" class="header-actions">
          <Button
            icon="pi pi-cog"
            :label="t('meetingAgenda.editDetails')"
            text
            @click="openEdit"
          />
          <RouterLink :to="`/meetings/${id}/prepare`">
            <Button
              icon="pi pi-pencil"
              :label="t('meetingAgenda.prepare')"
              outlined
            />
          </RouterLink>
        </div>
      </header>
      <div class="metadata">
        <span>
          <small>{{ t("meetingAgenda.leader") }}</small>
          {{ formatUser(meeting.meetingLeader) }}
        </span>
        <span>
          <small>{{ t("meetingAgenda.minuteTaker") }}</small>
          {{ formatUser(meeting.minuteTaker) }}
        </span>
        <span>
          <small>{{ t("meetingAgenda.participants") }}</small>
          <span class="participant-list">
            <Tag
              v-for="person in meeting.participants"
              :key="person.id"
              :value="formatUser(person.user)"
              :removable="canManage"
              severity="secondary"
              @remove="removeParticipant(person.userId)"
            />
            <Button
              v-if="canManage"
              :aria-label="t('meetingAgenda.addParticipant')"
              icon="pi pi-plus"
              rounded
              text
              @click="participantVisible = true"
            />
          </span>
        </span>
      </div>
      <section
        v-if="
          hasRichText(meeting.openingInput) || hasRichText(meeting.generalNotes)
        "
        :aria-label="t('meetingAgenda.notes')"
        class="meeting-notes"
      >
        <div v-if="hasRichText(meeting.openingInput)" class="meeting-note">
          <p class="meeting-note-label">
            <i class="pi pi-play-circle" />
            {{ t("meetingAgenda.opening") }}
          </p>
          <div
            class="meeting-note-content"
            v-html="safe(meeting.openingInput)"
          />
        </div>
        <div v-if="hasRichText(meeting.generalNotes)" class="meeting-note">
          <p class="meeting-note-label">
            <i class="pi pi-file-edit" />
            {{ t("meetingAgenda.generalNotes") }}
          </p>
          <div
            class="meeting-note-content"
            v-html="safe(meeting.generalNotes)"
          />
        </div>
      </section>
      <main class="document">
        <section
          v-for="(group, sectionIndex) in grouped"
          :key="group.section.id"
          class="agenda-section"
        >
          <h2>
            <span class="section-title">
              <span>
                {{ t("meetingAgenda.agendaNumber") }} {{ sectionIndex + 1 }}
              </span>
              {{ group.section.name }}
            </span>
            <span class="section-duration">
              {{ sectionDuration(group.items) }} {{ t("common.minuteShort") }}
            </span>
          </h2>
          <p v-if="!group.items.length" class="empty">
            {{ t("meetingAgenda.noTopics") }}
          </p>
          <article
            v-for="(item, itemIndex) in group.items"
            :key="item.id"
            class="agenda-topic"
          >
            <div class="topic-heading">
              <span class="number">
                {{ t("meetingAgenda.agendaNumber") }} {{ sectionIndex + 1 }}.{{
                  itemIndex + 1
                }}
              </span>
              <div>
                <RouterLink :to="`/topics/${item.topicId}`">
                  <h3>{{ item.topic?.name }}</h3>
                </RouterLink>
                <p class="topic-meta">
                  {{ formatUser(item.topic?.responsibleUser) }}
                  <template v-if="item.plannedDuration">
                    · {{ item.plannedDuration }} {{ t("common.minuteShort") }}
                  </template>
                </p>
              </div>
              <div v-if="canManage" class="topic-actions">
                <Button
                  :disabled="itemIndex === 0"
                  :aria-label="t('meetingAgenda.moveUp')"
                  icon="pi pi-chevron-up"
                  rounded
                  text
                  @click="move(group.items, itemIndex, -1)"
                />
                <Button
                  :disabled="itemIndex === group.items.length - 1"
                  :aria-label="t('meetingAgenda.moveDown')"
                  icon="pi pi-chevron-down"
                  rounded
                  text
                  @click="move(group.items, itemIndex, 1)"
                />
              </div>
            </div>
            <div
              v-if="item.agendaNote"
              class="agenda-note"
              v-html="safe(item.agendaNote)"
            />
            <div v-if="recent(item).length" class="updates">
              <p class="section-label">
                {{ t("meetingAgenda.recentUpdates") }}
              </p>
              <div
                v-for="update in recent(item)"
                :key="update.id"
                class="update"
              >
                <div v-html="safe(update.text)" />
                <small>
                  {{
                    formatDate(update.date, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })
                  }}
                  · {{ formatUser(update.createdBy) }}
                </small>
              </div>
            </div>
            <div v-if="item.topic?.tasks?.length" class="tasks">
              <p class="section-label">{{ t("meetingAgenda.openTasks") }}</p>
              <p v-for="task in item.topic.tasks" :key="task.id">
                <i class="pi pi-check-square" />
                {{ task.title }}
                <small>
                  {{ formatUser(task.assignedTo) }}
                  <template v-if="task.dueDate">
                    · {{ formatDate(`${task.dueDate}T12:00:00`) }}
                  </template>
                </small>
              </p>
            </div>
            <div v-if="canManage && openEditors[item.id]" class="quick-update">
              <RichTextEditor v-model="updateEditors[item.id]" height="100px" />
              <div class="quick-update-actions">
                <Button
                  :label="t('common.cancel')"
                  severity="secondary"
                  text
                  @click="openEditors[item.id] = false"
                />
                <Button
                  icon="pi pi-check"
                  :label="t('meetingAgenda.saveMinute')"
                  @click="addUpdate(item)"
                />
              </div>
            </div>
            <div v-else-if="canManage" class="topic-footer">
              <Button
                icon="pi pi-plus"
                :label="t('meetingAgenda.addMinute')"
                text
                @click="openUpdateEditor(item.id)"
              />
              <span>
                <Button
                  :aria-pressed="item.topic?.status === 'deferred'"
                  :label="
                    item.topic?.status === 'deferred'
                      ? t('meetingAgenda.deferred')
                      : t('meetingAgenda.defer')
                  "
                  :severity="
                    item.topic?.status === 'deferred' ? 'danger' : 'secondary'
                  "
                  text
                  @click="toggleDeferred(item)"
                />
                <Button
                  :label="t('meetingAgenda.markDone')"
                  severity="success"
                  text
                  @click="setTopicStatus(item, 'done')"
                />
              </span>
            </div>
          </article>
        </section>
      </main>
    </template>
    <p v-else-if="loading">{{ t("meetingAgenda.loading") }}</p>
    <Dialog
      v-if="canManage"
      v-model:visible="participantVisible"
      :header="t('meetingAgenda.participantTitle')"
      modal
    >
      <form
        id="participant-form"
        class="participant-form"
        @submit.prevent="addParticipant"
      >
        <Select
          v-model="participant.userId"
          :options="users"
          option-label="firstName"
          option-value="id"
          :placeholder="t('meetingAgenda.selectUser')"
        >
          <template #option="{ option }">{{ formatUser(option) }}</template>
        </Select>
        <Select
          v-model="participant.attendanceStatus"
          :options="attendanceOptions"
          option-label="label"
          option-value="value"
        />
      </form>
      <template #footer>
        <Button
          form="participant-form"
          :label="t('meetingAgenda.add')"
          type="submit"
        />
      </template>
    </Dialog>
    <Dialog
      v-if="canManage"
      v-model:visible="editVisible"
      :style="{ width: '48rem', maxWidth: 'calc(100vw - 2rem)' }"
      :header="t('meetingAgenda.editTitle')"
      modal
    >
      <form id="edit-meeting" class="edit-form" @submit.prevent="saveMeeting">
        <section aria-labelledby="schedule-heading" class="form-section">
          <div class="form-section-heading">
            <span class="section-icon">
              <i class="pi pi-calendar" />
            </span>
            <div>
              <h3 id="schedule-heading">{{ t("meetingAgenda.schedule") }}</h3>
              <p>{{ t("meetingAgenda.scheduleHelp") }}</p>
            </div>
          </div>
          <div class="schedule-row">
            <label>
              <span>
                {{ t("meetings.specialTitle") }}
                <small>{{ t("common.optional") }}</small>
              </span>
              <InputText
                v-model="editForm.title"
                :placeholder="t('meetingAgenda.exampleTitle')"
              />
            </label>
            <label>
              <span>{{ t("common.date") }}</span>
              <DatePicker
                v-model="editForm.date"
                :date-format="dateInputFormat()"
                icon="pi pi-calendar"
                icon-display="input"
                required
                show-icon
              />
            </label>
            <label>
              <span>{{ t("meetingAgenda.beginTime") }}</span>
              <DatePicker
                v-model="editForm.beginTime"
                :step-minute="15"
                hour-format="24"
                icon="pi pi-clock"
                icon-display="input"
                required
                show-icon
                time-only
              />
            </label>
            <label>
              <span>{{ t("common.status") }}</span>
              <Select
                v-model="editForm.status"
                :options="statusOptions"
                option-label="label"
                option-value="value"
              />
            </label>
          </div>
        </section>
        <section aria-labelledby="roles-heading" class="form-section">
          <div class="form-section-heading">
            <span class="section-icon">
              <i class="pi pi-users" />
            </span>
            <div>
              <h3 id="roles-heading">{{ t("meetingAgenda.roles") }}</h3>
              <p>{{ t("meetingAgenda.rolesHelp") }}</p>
            </div>
          </div>
          <div class="roles-grid">
            <label>
              <span>{{ t("meetingAgenda.leader") }}</span>
              <Select
                v-model="editForm.meetingLeaderId"
                :options="users"
                option-label="firstName"
                option-value="id"
                :placeholder="t('meetingAgenda.selectLeader')"
                show-clear
              >
                <template #option="{ option }">
                  {{ formatUser(option) }}
                </template>
              </Select>
            </label>
            <label>
              <span>{{ t("meetingAgenda.minuteTaker") }}</span>
              <Select
                v-model="editForm.minuteTakerId"
                :options="users"
                option-label="firstName"
                option-value="id"
                :placeholder="t('meetingAgenda.selectMinuteTaker')"
                show-clear
              >
                <template #option="{ option }">
                  {{ formatUser(option) }}
                </template>
              </Select>
            </label>
          </div>
        </section>
        <section
          aria-labelledby="notes-heading"
          class="form-section notes-section"
        >
          <div class="form-section-heading">
            <span class="section-icon">
              <i class="pi pi-align-left" />
            </span>
            <div>
              <h3 id="notes-heading">{{ t("meetingAgenda.notesTitle") }}</h3>
              <p>{{ t("meetingAgenda.notesHelp") }}</p>
            </div>
          </div>
          <label>
            <span>{{ t("meetingAgenda.opening") }}</span>
            <RichTextEditor v-model="editForm.openingInput" height="100px" />
          </label>
          <label>
            <span>{{ t("meetingAgenda.generalNotes") }}</span>
            <RichTextEditor v-model="editForm.generalNotes" height="100px" />
          </label>
        </section>
      </form>
      <template #footer>
        <Button
          :label="t('common.cancel')"
          severity="secondary"
          text
          @click="editVisible = false"
        />
        <Button
          form="edit-meeting"
          icon="pi pi-check"
          :label="t('meetingAgenda.saveDetails')"
          type="submit"
        />
      </template>
    </Dialog>
  </section>
</template>
<style scoped>
.agenda-page {
  max-width: 980px;
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

.meeting-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.meeting-header h1 {
  margin: 0;
  font-size: 2.3rem;
  letter-spacing: -0.04em;
}

.meeting-header p {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.5rem 0 0;
  color: #68758a;
}

.metadata {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  padding: 1rem 1.2rem;
  border: 1px solid #e1e6ed;
  border-radius: 0.8rem;
  background: #fff;
}

.metadata > span {
  display: grid;
  gap: 0.3rem;
  font-weight: 650;
}

.metadata small,
.topic-meta,
.update small,
.tasks small {
  color: #718096;
  font-size: 0.75rem;
  font-weight: 400;
}

.participant-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.meeting-notes {
  display: grid;
  gap: 0.8rem;
  margin-top: 1rem;
}

.meeting-note {
  padding: 1rem 1.2rem;
  border-left: 3px solid #7996c8;
  background: #eef3fa;
}

.meeting-note-label {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0 0 0.55rem;
  color: #536f9f;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.meeting-note-content {
  color: #344258;
  line-height: 1.55;
}

.meeting-note-content :deep(p) {
  margin: 0.35rem 0;
}

.document {
  margin-top: 1.7rem;
}

.agenda-section {
  margin-bottom: 2rem;
}

.agenda-section > h2 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  margin: 0 0 0.7rem;
  padding-bottom: 0.6rem;
  /*border-bottom: 2px solid #243047;*/
  font-size: 1.25rem;
}

.agenda-section > h2 span {
  color: #607dae;
  font-size: inherit;
  letter-spacing: 0.02em;
}

.agenda-section > h2 .section-title {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  color: inherit;
}

.agenda-section > h2 .section-duration {
  flex: 0 0 auto;
  font-size: 0.85rem;
  font-weight: 650;
}

.agenda-topic {
  margin-bottom: 0.7rem;
  padding: 1rem 1.15rem;
  border: 1px solid #e1e6ed;
  border-radius: 0.7rem;
  background: #fff;
}

.topic-heading {
  display: grid;
  grid-template-columns: 72px 1fr auto;
  gap: 0.7rem;
  align-items: start;
}

.number {
  padding-top: 0.2rem;
  color: #607dae;
  font-size: 0.96rem;
  font-weight: 800;
}

.topic-heading a {
  text-decoration: none;
}

.topic-heading h3 {
  margin: 0;
  font-size: 1.05rem;
}

.topic-meta {
  margin: 0.25rem 0 0;
}

.topic-actions {
  display: flex;
}

.agenda-note {
  margin: 0.8rem 0 0 72px;
  color: #4a5568;
}

.section-label {
  margin: 0.9rem 0 0.45rem;
  color: #607dae;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.updates,
.tasks {
  margin-left: 72px;
}

.update {
  margin-bottom: 0.45rem;
  padding: 0.65rem 0.8rem;
  border-radius: 0.5rem;
  background: #f5f7fa;
}

.update :deep(p) {
  margin: 0 0 0.3rem;
}

.tasks p {
  margin: 0.3rem 0;
}

.topic-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0.75rem 0 0 64px;
  border-top: 1px solid #edf0f4;
  padding-top: 0.45rem;
}

.quick-update {
  display: grid;
  gap: 0.5rem;
  margin-top: 0.9rem;
  width: 100%;
}

.quick-update :deep(.p-editor) {
  width: 100%;
  min-width: 0;
}

.quick-update-actions {
  display: flex;
  justify-content: end;
  gap: 0.4rem;
}

.empty {
  margin: 0.5rem 0;
  color: #8a94a6;
  font-style: italic;
}

.participant-form {
  display: grid;
  gap: 1rem;
  min-width: 280px;
}

.edit-form {
  display: grid;
  gap: 0.9rem;
}

.form-section {
  padding: 1rem;
  border: 1px solid #e1e6ed;
  border-radius: 0.75rem;
  background: #fbfcfe;
}

.form-section-heading {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  margin-bottom: 0.9rem;
}

.section-icon {
  display: grid;
  flex: 0 0 2rem;
  height: 2rem;
  place-items: center;
  border-radius: 0.55rem;
  background: #eaf0f9;
  color: #536f9f;
}

.form-section-heading h3 {
  margin: 0.05rem 0 0;
  font-size: 0.96rem;
}

.form-section-heading p {
  margin: 0.2rem 0 0;
  color: #718096;
  font-size: 0.78rem;
}

.schedule-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 9.5rem 6rem 9.5rem;
  gap: 0.8rem;
}

.roles-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.8rem;
}

.edit-form label {
  display: grid;
  align-content: start;
  gap: 0.4rem;
  min-width: 0;
}

.edit-form label > span {
  color: #344258;
  font-size: 0.79rem;
  font-weight: 700;
}

.edit-form label > span small {
  margin-left: 0.3rem;
  color: #8390a3;
  font-size: 0.68rem;
  font-weight: 500;
  text-transform: uppercase;
}

.edit-form :deep(input),
.edit-form :deep(.p-select),
.edit-form :deep(.p-datepicker) {
  width: 100%;
}

.notes-section {
  display: grid;
  gap: 0.8rem;
}

.notes-section .form-section-heading {
  margin-bottom: 0.1rem;
}

@media (max-width: 700px) {
  .meeting-header {
    align-items: stretch;
    flex-direction: column;
  }

  .metadata {
    grid-template-columns: 1fr;
  }

  .topic-heading {
    grid-template-columns: 1fr;
  }

  .number {
    padding: 0;
  }

  .agenda-note,
  .updates,
  .tasks,
  .topic-footer {
    margin-left: 0;
  }

  .topic-actions {
    position: absolute;
    right: 1.5rem;
  }

  .topic-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .schedule-row,
  .roles-grid {
    grid-template-columns: 1fr;
  }

  .form-section {
    padding: 0.85rem;
  }
}
</style>
