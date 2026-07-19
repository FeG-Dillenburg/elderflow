<script setup lang="ts">
import DOMPurify from "dompurify";
import { useI18n } from "vue-i18n";
import { formatUser, type Topic } from "../../../api/domain";
import MembershipSignal from "./MembershipSignal.vue";

defineProps<{ topic: Topic }>();
const { t } = useI18n();
const safe = (html: string | null) => DOMPurify.sanitize(html ?? "");
</script>

<template>
  <section class="membership-detail">
    <dl>
      <dt>{{ t("newMembershipTopic.processStatus") }}</dt>
      <dd>{{ topic.membershipProcessStatus || t("common.none") }}</dd>
      <dt>{{ t("newMembershipTopic.signal") }}</dt>
      <dd><MembershipSignal :signal="topic.membershipStatusSignal ?? 'new'" /></dd>
      <dt>{{ t("newMembershipTopic.responsible") }}</dt>
      <dd>{{ formatUser(topic.responsibleUser) }}</dd>
      <dt>{{ t("newMembershipTopic.godparents") }}</dt>
      <dd>{{ topic.godparents || t("common.none") }}</dd>
    </dl>
    <div v-if="topic.description" class="description">
      <h2>{{ t("newMembershipTopic.description") }}</h2>
      <div v-html="safe(topic.description)" />
    </div>
  </section>
</template>

<style scoped>
.membership-detail {
  display: grid;
  gap: 1.2rem;
}

dl {
  display: grid;
  grid-template-columns: minmax(9rem, auto) 1fr;
  gap: 0.55rem 1rem;
  margin: 0;
}

dt {
  color: #68758a;
  font-weight: 650;
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
}

h2 {
  margin: 0 0 0.8rem;
  font-size: 1rem;
}

@media (max-width: 520px) {
  dl {
    grid-template-columns: 1fr;
    gap: 0.2rem;
  }

  dd {
    margin-bottom: 0.55rem;
  }
}
</style>
