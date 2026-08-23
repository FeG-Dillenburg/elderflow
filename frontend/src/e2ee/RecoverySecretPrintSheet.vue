<script setup lang="ts">
import Button from "primevue/button";
import { useI18n } from "vue-i18n";

defineProps<{
  recoverySecret: string;
}>();

const { t } = useI18n();
const instanceUrl = window.location.origin;

function printRecoverySecret(): void {
  window.print();
}
</script>

<template>
  <section
    class="recovery-secret-print-sheet"
    :aria-label="t('e2ee.recoveryPrintTitle')"
  >
    <div class="secret-block">
      <code class="recovery-secret" aria-live="polite">
        {{ recoverySecret }}
      </code>
    </div>

    <Button
      class="print-action"
      type="button"
      icon="pi pi-print"
      :label="t('e2ee.printRecoverySecret')"
      @click="printRecoverySecret"
    />
  </section>

  <Teleport to="body">
    <section class="recovery-secret-print-document">
      <header class="print-header">
        <img
          class="print-wordmark"
          src="/elderflow-wordmark-color.png"
          :alt="t('brand.name')"
        />
        <h1>{{ t("e2ee.recoveryPrintTitle") }}</h1>
        <p>{{ t("e2ee.recoveryPrintSubtitle") }}</p>
      </header>

      <div class="printed-secret-block">
        <span class="print-label">{{ t("e2ee.recoverySecret") }}</span>
        <code class="printed-recovery-secret">
          {{ recoverySecret }}
        </code>
      </div>

      <dl class="print-details">
        <div>
          <dt>{{ t("e2ee.recoveryPrintInstance") }}</dt>
          <dd class="print-instance-url">{{ instanceUrl }}</dd>
        </div>
      </dl>

      <p class="print-instructions">
        {{ t("e2ee.recoveryPrintInstructions") }}
      </p>
    </section>
  </Teleport>
</template>

<style scoped>
.recovery-secret-print-sheet,
.secret-block {
  display: grid;
  gap: 0.75rem;
}

.recovery-secret-print-document {
  display: none;
}

.recovery-secret {
  overflow-wrap: anywhere;
  padding: 1rem;
  border: 1px dashed #64748b;
  border-radius: 0.5rem;
  background: #f8fafc;
}

.print-action {
  width: 100%;
}

@media print {
  @page {
    margin: 18mm;
  }

  :global(body > *:not(.recovery-secret-print-document)) {
    display: none !important;
  }

  .recovery-secret-print-document {
    display: grid;
    align-content: start;
    gap: 0;
    min-height: calc(100vh - 36mm);
    background: #fff;
    color: #1e293b;
    print-color-adjust: exact;
  }

  .print-header {
    display: grid;
    gap: 0.35rem;
    padding-bottom: 8mm;
    border-bottom: 2px solid #2f6ea3;
  }

  .print-header h1,
  .print-header p {
    margin: 0;
  }

  .print-header p {
    color: #52647d;
  }

  .print-wordmark {
    width: 48mm;
    height: auto;
    margin-bottom: 5mm;
  }

  .printed-secret-block {
    display: grid;
    gap: 3mm;
    margin-top: 12mm;
  }

  .print-label {
    display: block;
    color: #52647d;
    font-size: 10pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .printed-recovery-secret {
    overflow-wrap: anywhere;
    padding: 8mm;
    border: 1.5px solid #2f6ea3;
    border-radius: 3mm;
    background: #f5f9fd;
    font-size: 14pt;
    line-height: 1.6;
  }

  .print-details {
    display: block;
    margin: 10mm 0 0;
  }

  .print-details div {
    display: grid;
    gap: 2mm;
  }

  .print-details dt {
    color: #52647d;
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
  }

  .print-details dd {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11pt;
  }

  .print-instructions {
    display: block;
    margin: 12mm 0 0;
    padding: 6mm;
    border-left: 4px solid #d97706;
    background: #fffbeb;
    color: #713f12;
    line-height: 1.5;
  }
}
</style>
