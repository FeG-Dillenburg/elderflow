<script setup lang="ts">
import Button from "primevue/button";
import { useI18n } from "vue-i18n";
import type { MeetingTopic, Topic, TopicFieldPatch, User } from "../../../api/domain";
import NewMembershipTopicAppearance from "./NewMembershipTopicAppearance.vue";

defineProps<{
  item: MeetingTopic;
  canEdit: boolean;
  completed?: boolean;
  users: User[];
  saveField: (patch: TopicFieldPatch) => Promise<Topic>;
  saveNote: (note: string | null) => Promise<MeetingTopic>;
  markDone?: () => Promise<void>;
}>();
const { t } = useI18n();
</script>

<template>
  <div class="membership-agenda">
    <NewMembershipTopicAppearance
      :item="item"
      :can-edit="canEdit"
      :completed="completed"
      :users="users"
      :save-field="saveField"
      :save-note="saveNote"
    />
    <div v-if="canEdit && item.topic?.membershipStatusSignal === 'nearly_finished'" class="lifecycle-actions">
      <Button
        :label="t('meetingAgenda.markDone')"
        severity="success"
        text
        size="small"
        @click="markDone"
      />
    </div>
  </div>
</template>

<style scoped>
.membership-agenda {
  display: grid;
  gap: 0.35rem;
  width: 100%;
}

.lifecycle-actions {
  display: flex;
  justify-content: end;
}
</style>
