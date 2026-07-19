<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { RouterLink } from "vue-router";
import Select from "primevue/select";
import { useI18n } from "vue-i18n";
import {
  formatUser,
  membershipStatusSignals,
  type MembershipStatusSignal,
  type MeetingTopic,
  type Topic,
  type TopicFieldPatch,
  type User,
} from "../../../api/domain";
import PersonTopicNote from "../person/PersonTopicNote.vue";
import MembershipInlineText from "./MembershipInlineText.vue";
import MembershipSignal from "./MembershipSignal.vue";

const props = defineProps<{
  item: MeetingTopic;
  canEdit: boolean;
  completed?: boolean;
  users: User[];
  saveField: (patch: TopicFieldPatch) => Promise<Topic>;
  saveNote: (note: string | null) => Promise<MeetingTopic>;
}>();
const { t } = useI18n();
const liveTopic = computed(() => props.item.topic!);
const signal = ref<MembershipStatusSignal>(liveTopic.value.membershipStatusSignal ?? "new");
const responsibleUserId = ref<string | null>(liveTopic.value.responsibleUserId ?? null);
const signalOptions = computed(() => membershipStatusSignals.map((value) => ({
  value,
  label: t(`newMembershipTopic.signals.${value}`),
})));
const selectionState = reactive<Record<string, "idle" | "saving" | "saved" | "error">>({});
const selectionErrors = reactive<Record<string, string>>({});
const queued: Record<string, unknown> = {};
const saving = new Set<string>();

const drainSelection = async (field: "membershipStatusSignal" | "responsibleUserId") => {
  if (saving.has(field)) return;
  saving.add(field);
  while (Object.prototype.hasOwnProperty.call(queued, field)) {
    const value = queued[field];
    delete queued[field];
    selectionState[field] = "saving";
    selectionErrors[field] = "";
    try {
      await props.saveField({ [field]: value } as TopicFieldPatch);
      selectionState[field] = "saved";
    } catch (cause) {
      selectionErrors[field] = cause instanceof Error ? cause.message : t("newMembershipTopic.saveFailed");
      selectionState[field] = "error";
      delete queued[field];
      break;
    }
  }
  saving.delete(field);
};
const saveSelection = (field: "membershipStatusSignal" | "responsibleUserId", value: unknown) => {
  queued[field] = value;
  void drainSelection(field);
};

const display = computed(() => !props.completed ? {
  name: liveTopic.value.name,
  responsible: formatUser(liveTopic.value.responsibleUser),
  processStatus: liveTopic.value.membershipProcessStatus,
  signal: liveTopic.value.membershipStatusSignal ?? "new",
  godparents: liveTopic.value.godparents,
} : {
  name: props.item.topicNameSnapshot ?? liveTopic.value.name,
  responsible: props.item.responsibleUserDisplayNameSnapshot ?? t("common.unassigned"),
  processStatus: props.item.membershipProcessStatusSnapshot,
  signal: props.item.membershipStatusSignalSnapshot ?? "new",
  godparents: props.item.godparentsSnapshot,
});
</script>

<template>
  <div class="membership-appearance">
    <div class="field name-field">
      <span>{{ t("newMembershipTopic.nameLabel") }}</span>
      <RouterLink :to="`/topics/${item.topicId}`">{{ display.name }}</RouterLink>
    </div>
    <div class="status-area">
      <MembershipInlineText
        v-if="canEdit"
        :value="liveTopic.membershipProcessStatus"
        :label="t('newMembershipTopic.processStatus')"
        :save="(value) => saveField({ membershipProcessStatus: value })"
      />
      <div v-else class="field status-field">
        <span>{{ t("newMembershipTopic.processStatus") }}</span>
        <strong>{{ display.processStatus || t("common.none") }}</strong>
      </div>
      <div class="signal-field" :data-signal="canEdit ? signal : display.signal">
        <span>{{ t("newMembershipTopic.signal") }}</span>
        <div>
          <MembershipSignal :signal="canEdit ? signal : display.signal" />
          <Select
            v-if="canEdit"
            v-model="signal"
            class="signal-select"
            :options="signalOptions"
            option-label="label"
            option-value="value"
            :aria-label="t('newMembershipTopic.signal')"
            :loading="selectionState.membershipStatusSignal === 'saving'"
            @update:model-value="saveSelection('membershipStatusSignal', $event)"
          />
        </div>
        <small v-if="selectionState.membershipStatusSignal === 'error'" role="alert">
          {{ selectionErrors.membershipStatusSignal }}
          <button type="button" @click="saveSelection('membershipStatusSignal', signal)">
            {{ t("newMembershipTopic.retry") }}
          </button>
        </small>
      </div>
    </div>
    <div class="field responsible-field">
      <span>{{ t("newMembershipTopic.responsible") }}</span>
      <Select
        v-if="canEdit"
        v-model="responsibleUserId"
        :options="users"
        option-label="firstName"
        option-value="id"
        show-clear
        :aria-label="t('newMembershipTopic.responsible')"
        :loading="selectionState.responsibleUserId === 'saving'"
        @update:model-value="saveSelection('responsibleUserId', $event)"
      >
        <template #option="{ option }">{{ formatUser(option) }}</template>
      </Select>
      <strong v-else>{{ display.responsible }}</strong>
      <small v-if="selectionState.responsibleUserId === 'error'" role="alert">
        {{ selectionErrors.responsibleUserId }}
        <button type="button" @click="saveSelection('responsibleUserId', responsibleUserId)">
          {{ t("newMembershipTopic.retry") }}
        </button>
      </small>
    </div>
    <MembershipInlineText
      v-if="canEdit"
      :value="liveTopic.godparents"
      :label="t('newMembershipTopic.godparents')"
      :save="(value) => saveField({ godparents: value })"
    />
    <div v-else class="field godparents-field">
      <span>{{ t("newMembershipTopic.godparents") }}</span>
      <strong>{{ display.godparents || t("common.none") }}</strong>
    </div>
    <div class="note-field">
      <span>{{ t("newMembershipTopic.note") }}</span>
      <PersonTopicNote :item="item" :read-only="!canEdit" :save="saveNote" />
    </div>
  </div>
</template>

<style scoped>
.membership-appearance {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem 1rem;
  width: 100%;
}

.field,
.status-area,
.signal-field,
.note-field {
  display: grid;
  gap: 0.3rem;
  min-width: 0;
}

.field > span,
.signal-field > span,
.note-field > span {
  color: #5f6b7c;
  font-size: 0.75rem;
  font-weight: 700;
}

.name-field a {
  color: inherit;
  font-size: 1.05rem;
  font-weight: 800;
  text-decoration: none;
}

.status-area {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}

.signal-field {
  min-width: min(100%, 14rem);
}

.signal-field > div {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.signal-select {
  min-width: 10rem;
}

.note-field {
  grid-column: 1 / -1;
}

small[role="alert"] {
  color: #b42318;
  font-size: 0.72rem;
}

small[role="alert"] button {
  border: 0;
  padding: 0 0.2rem;
  color: inherit;
  background: transparent;
  text-decoration: underline;
  cursor: pointer;
}

@media (max-width: 700px) {
  .membership-appearance {
    grid-template-columns: 1fr;
  }

  .status-area {
    grid-template-columns: 1fr;
  }

  .signal-field,
  .note-field {
    grid-column: auto;
    grid-row: auto;
    justify-self: stretch;
  }

  .signal-field > div {
    flex-wrap: wrap;
  }
}
</style>
