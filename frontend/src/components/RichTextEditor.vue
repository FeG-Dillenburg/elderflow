<script setup lang="ts">
import Editor from 'primevue/editor';

withDefaults(defineProps<{ placeholder?: string; height?: string }>(), {
  placeholder: 'Write an update...',
  height: '160px',
});

const model = defineModel<string>({ default: '' });
</script>

<template>
  <Editor v-model="model" :placeholder="placeholder" :editor-style="{ height }">
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
