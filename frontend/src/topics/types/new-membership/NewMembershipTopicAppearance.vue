<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
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
import MembershipInlineText from "./MembershipInlineText.vue";
import PairedMeetingTexts from "../../components/PairedMeetingTexts.vue";
import {
  membershipSignalIcons,
  membershipSignalStyles,
} from "./membershipStatusPresentation";

const props = defineProps<{
  item: MeetingTopic;
  canEdit: boolean;
  completed?: boolean;
  users: User[];
  saveField: (patch: TopicFieldPatch) => Promise<Topic>;
  meetingTextMode?: "preparation" | "active" | "completed";
  canWriteMinutes?: boolean;
  savePreparationContext?: (note: string | null) => Promise<unknown>;
  saveMinutes?: (note: string | null) => Promise<unknown>;
}>();
const { t } = useI18n();
const liveTopic = computed(() => props.item.topic!);
const signal = ref<MembershipStatusSignal>(liveTopic.value.membershipStatusSignal ?? "new");
const responsibleUserId = ref<string | null>(liveTopic.value.responsibleUserId ?? null);
const signalMenuOpen = ref(false);
const signalPicker = ref<HTMLElement>();
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

const selectSignal = (value: MembershipStatusSignal) => {
  signal.value = value;
  signalMenuOpen.value = false;
  saveSelection("membershipStatusSignal", value);
};

const closeSignalMenu = (event: MouseEvent) => {
  if (!signalPicker.value?.contains(event.target as Node)) signalMenuOpen.value = false;
};

const closeSignalMenuOnEscape = (event: KeyboardEvent) => {
  if (event.key === "Escape") signalMenuOpen.value = false;
};

onMounted(() => {
  document.addEventListener("click", closeSignalMenu);
  document.addEventListener("keydown", closeSignalMenuOnEscape);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", closeSignalMenu);
  document.removeEventListener("keydown", closeSignalMenuOnEscape);
});

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
const savePreparation = (text: string | null) =>
  props.savePreparationContext?.(text) ?? Promise.resolve();
const saveCurrentMinutes = (text: string | null) =>
  props.saveMinutes?.(text) ?? Promise.resolve();
</script>

<template>
  <div class="membership-appearance-container">
    <div class="membership-appearance">
      <div class="table-cell name-cell">
        <span class="cell-label">{{ t("newMembershipTopic.nameLabel") }}</span>
        <RouterLink class="cell-value name-value" :to="`/topics/${item.topicId}`">
          {{ display.name }}
        </RouterLink>
      </div>
      <div class="table-cell responsible-cell">
        <span class="cell-label">{{ t("newMembershipTopic.responsible") }}</span>
        <div class="cell-value responsible-value">
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
        </div>
        <small v-if="selectionState.responsibleUserId === 'error'" class="cell-error" role="alert">
          {{ selectionErrors.responsibleUserId }}
          <button type="button" @click="saveSelection('responsibleUserId', responsibleUserId)">
            {{ t("newMembershipTopic.retry") }}
          </button>
        </small>
      </div>
      <div class="table-cell godparents-cell">
        <span class="cell-label">{{ t("newMembershipTopic.godparents") }}</span>
        <div class="cell-value godparents-value">
          <MembershipInlineText
            v-if="canEdit"
            compact
            hide-label
            :value="liveTopic.godparents"
            :label="t('newMembershipTopic.godparents')"
            :save="(value) => saveField({ godparents: value })"
          />
          <strong v-else>{{ display.godparents || t("common.none") }}</strong>
        </div>
      </div>
      <div class="table-cell status-cell">
        <span class="cell-label">{{ t("common.status") }}</span>
        <div
          class="cell-value status-value"
          :data-signal="canEdit ? signal : display.signal"
          :style="membershipSignalStyles[canEdit ? signal : display.signal]"
        >
          <div v-if="canEdit" ref="signalPicker" class="signal-picker">
            <button
              class="signal-trigger"
              type="button"
              aria-haspopup="menu"
              :aria-expanded="signalMenuOpen"
              :aria-label="t('newMembershipTopic.changeSignal', { signal: t(`newMembershipTopic.signals.${signal}`) })"
              @click.stop="signalMenuOpen = !signalMenuOpen"
            >
              <i :class="membershipSignalIcons[signal]" aria-hidden="true" />
            </button>
            <div v-if="signalMenuOpen" class="signal-menu" role="menu">
              <button
                v-for="option in membershipStatusSignals"
                :key="option"
                class="signal-option"
                :data-signal="option"
                :style="membershipSignalStyles[option]"
                type="button"
                role="menuitemradio"
                :aria-checked="signal === option"
                :aria-label="t(`newMembershipTopic.signals.${option}`)"
                @click="selectSignal(option)"
              >
                <i :class="membershipSignalIcons[option]" aria-hidden="true" />
              </button>
            </div>
          </div>
          <span v-else class="signal-icon" :aria-label="t('newMembershipTopic.signalMeaning', { signal: t(`newMembershipTopic.signals.${display.signal}`) })">
            <i :class="membershipSignalIcons[display.signal]" aria-hidden="true" />
          </span>
          <MembershipInlineText
            v-if="canEdit"
            compact
            hide-label
            :value="liveTopic.membershipProcessStatus"
            :label="t('common.status')"
            :save="(value) => saveField({ membershipProcessStatus: value })"
          />
          <strong v-else>{{ display.processStatus || t("common.none") }}</strong>
        </div>
        <small v-if="selectionState.membershipStatusSignal === 'error'" class="cell-error" role="alert">
          {{ selectionErrors.membershipStatusSignal }}
          <button type="button" @click="saveSelection('membershipStatusSignal', signal)">
            {{ t("newMembershipTopic.retry") }}
          </button>
        </small>
      </div>
      <div class="note-field">
        <PairedMeetingTexts
          :item="item"
          :mode="meetingTextMode ?? (completed ? 'completed' : 'preparation')"
          :can-write-minutes="canWriteMinutes"
          :save-preparation="savePreparation"
          :save-minutes="saveCurrentMinutes"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.membership-appearance-container {
  container-name: membership-card;
  container-type: inline-size;
  min-width: 0;
  width: 100%;
}

.membership-appearance {
  display: grid;
  grid-template-columns: 1fr 1fr;
  overflow: hidden;
  width: 100%;
  border: 1px solid #c7cdd6;
  border-radius: 0.75rem;
  background: #ffffff;
}

.table-cell {
  position: relative;
  display: grid;
  grid-template-columns: minmax(8rem, 32%) minmax(0, 1fr);
  min-width: 0;
  border-bottom: 1px solid #c7cdd6;
}

.name-cell,
.responsible-cell {
  border-right: 1px solid #c7cdd6;
}

.name-cell {
  grid-column: 1;
  grid-row: 1;
}

.status-cell {
  grid-column: 2;
  grid-row: 1;
}

.responsible-cell {
  grid-column: 1;
  grid-row: 2;
}

.godparents-cell {
  grid-column: 2;
  grid-row: 2;
}

.cell-label {
  display: flex;
  align-items: center;
  min-height: 3rem;
  padding: 0.55rem 0.75rem;
  color: #303846;
  background: #e8eaed;
  font-size: 0.86rem;
  font-weight: 700;
}

.cell-value {
  display: flex;
  align-items: center;
  min-width: 0;
  min-height: 3rem;
}

.name-value {
  padding: 0.55rem 0.8rem;
  color: inherit;
  font-size: 1rem;
  font-weight: 800;
  text-decoration: none;
}

.status-value > strong,
.responsible-value > strong,
.godparents-value > strong {
  padding: 0.55rem 0.75rem;
}

.signal-picker {
  position: relative;
  align-self: stretch;
  flex: 0 0 3rem;
}

.signal-trigger,
.signal-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 100%;
  min-height: 3rem;
  color: inherit;
}

.signal-trigger {
  border: 0;
  background: transparent;
  cursor: pointer;
}

.signal-trigger:hover,
.signal-trigger:focus-visible {
  background: rgb(0 0 0 / 10%);
}

.signal-menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 0.35rem);
  left: 0;
  display: flex;
  gap: 0.25rem;
  padding: 0.35rem;
  border: 1px solid #c7cdd6;
  border-radius: 0.55rem;
  background: #ffffff;
  box-shadow: 0 0.5rem 1.5rem rgb(30 42 62 / 20%);
}

.signal-option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 2px solid transparent;
  border-radius: 0.4rem;
  cursor: pointer;
}

.signal-option[aria-checked="true"],
.signal-option:focus-visible {
  border-color: #17263d;
  outline: none;
}

.status-value > :deep(.inline-field) {
  flex: 1 1 auto;
  min-width: 0;
}

.status-value :deep(input) {
  height: 3rem;
  padding: 0.55rem 0.75rem;
  border: 0;
  border-radius: 0;
  color: inherit;
  background: transparent;
  box-shadow: none;
  font-weight: 700;
}

.status-value :deep(input:focus) {
  box-shadow: inset 0 0 0 2px rgb(255 255 255 / 65%);
}

.responsible-value :deep(.p-select),
.godparents-value :deep(input) {
  width: 100%;
  height: 3rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.responsible-value :deep(.p-select-label),
.godparents-value :deep(input) {
  display: flex;
  align-items: center;
  min-height: 3rem;
  padding-top: 0.55rem;
  padding-bottom: 0.55rem;
}

.godparents-value > :deep(.inline-field) {
  width: 100%;
}

.cell-error {
  position: absolute;
  z-index: 3;
  top: calc(100% - 0.2rem);
  right: 0.5rem;
  padding: 0.15rem 0.3rem;
  border-radius: 0.25rem;
  background: #ffffff;
}

.note-field {
  grid-column: 1 / -1;
  display: grid;
  gap: 0.2rem;
  min-width: 0;
  padding: 0.55rem 0.75rem 0.2rem;
}

.note-field :deep(textarea) {
  padding: 0.25rem 0 0.5rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.note-field :deep(textarea:focus) {
  box-shadow: none;
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

@container membership-card (max-width: 42rem) {
  .membership-appearance {
    grid-template-columns: 1fr;
  }

  .name-cell,
  .responsible-cell,
  .godparents-cell,
  .status-cell {
    grid-column: auto;
    grid-row: auto;
    border-right: 0;
  }

  .note-field {
    grid-column: auto;
  }

  .signal-menu {
    flex-wrap: wrap;
    width: 7.15rem;
  }
}
</style>
