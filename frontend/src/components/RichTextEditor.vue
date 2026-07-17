<script setup lang="ts">
import Editor from 'primevue/editor';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = withDefaults(defineProps<{ placeholder?: string; height?: string }>(), {
  height: '160px',
});
const { t } = useI18n();
const resolvedPlaceholder = computed(() => props.placeholder ?? t('topicDetail.addUpdate'));

const model = defineModel<string>({ default: '' });
</script>

<template>
  <Editor v-model="model" :placeholder="resolvedPlaceholder" :editor-style="{ height: props.height }">
    <template #toolbar>
      <span class="ql-formats">
        <button class="ql-bold" type="button" />
        <button class="ql-italic" type="button" />
        <button class="ql-underline" type="button" />
      </span>
      <span class="ql-formats">
        <button class="ql-list" value="ordered" type="button" />
        <button class="ql-list" value="bullet" type="button" />
        <button class="ql-link" type="button" />
      </span>
    </template>
  </Editor>
</template>
