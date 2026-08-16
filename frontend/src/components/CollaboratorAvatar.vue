<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { CollaboratorPresentation } from "../e2ee/collaborator-presentation";

defineProps<{
  collaborator: CollaboratorPresentation;
}>();
const { t } = useI18n();
</script>

<template>
  <span
    class="collaborator-avatar"
    role="listitem"
    :style="{ backgroundColor: collaborator.color }"
    :title="collaborator.name"
    :aria-label="t('editor.liveCollaborator', { name: collaborator.name })"
  >
    <img
      v-if="collaborator.imageUrl"
      :src="collaborator.imageUrl"
      alt=""
      aria-hidden="true"
    >
    <span v-else aria-hidden="true">
      {{ collaborator.initials }}
    </span>
  </span>
</template>

<style scoped>
.collaborator-avatar {
  display: inline-grid;
  overflow: hidden;
  place-items: center;
  width: 1.8rem;
  height: 1.8rem;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgb(36 52 77 / 18%);
  color: #fff;
  font-size: 0.66rem;
  font-weight: 800;
  line-height: 1;
}

.collaborator-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
