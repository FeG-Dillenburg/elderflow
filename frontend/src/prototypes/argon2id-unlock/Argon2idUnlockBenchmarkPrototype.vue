<script lang="ts" setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import {
  PROFILE,
  THRESHOLDS,
  measureMemory,
  median,
  runtimeMetadata,
  type BenchmarkReport,
  type DerivationResult,
  type DeviceClass,
  type WorkerFailure,
  type WorkerReady,
  type WorkerResponse,
} from './benchmark';

type Locale = 'en' | 'de';
type RunState = 'idle' | 'running' | 'complete' | 'failed' | 'cancelled';

const copy = {
  en: {
    eyebrow: 'Disposable evidence · Wayfinder prototype',
    title: 'Argon2id unlock benchmark',
    intro: 'Does the fixed v1 profile remain usable on ElderFlow’s lowest supported browsers without changing a single security parameter?',
    warning: 'Prototype only — fixed public test input, no real passphrases, no persistence.',
    profile: 'Committed profile',
    environment: 'Test environment',
    deviceLabel: 'Device label',
    devicePlaceholder: 'e.g. Moto G Power (2022)',
    deviceClass: 'Threshold class',
    desktop: 'Desktop',
    phone: 'Smartphone',
    run: 'Run cold + 3 warm derivations',
    cancel: 'Cancel active run',
    cancellation: 'Probe cancellation',
    fallback: 'Probe without WebAssembly',
    export: 'Export evidence JSON',
    results: 'This device’s evidence',
    noResults: 'Run the benchmark to capture evidence on this browser.',
    matrix: 'Required support matrix',
    thresholds: 'Pass/fail thresholds',
    status: 'Status',
    cold: 'Cold unlock',
    warm: 'Warm median',
    responsiveness: 'Largest main-thread interval',
    memory: 'Live / retained memory growth',
    reference: 'Native reference vector',
    exact: 'Exact security profile',
    cancellationResult: 'Cancellation probe',
    fallbackResult: 'No-WebAssembly probe',
    pending: 'Not run',
    idle: 'Not run',
    running: 'Running…',
    complete: 'Complete',
    failed: 'Failed',
    cancelled: 'Cancelled',
    memoryUnavailable: 'Browser measurement unavailable — inspect manually',
  },
  de: {
    eyebrow: 'Einmaliger Nachweis · Wayfinder-Prototyp',
    title: 'Argon2id-Entsperr-Benchmark',
    intro: 'Bleibt das feste v1-Profil auf den ältesten unterstützten ElderFlow-Browsern nutzbar, ohne einen Sicherheitsparameter zu ändern?',
    warning: 'Nur Prototyp — feste öffentliche Testdaten, keine echten Passphrasen, keine Speicherung.',
    profile: 'Festgelegtes Profil',
    environment: 'Testumgebung',
    deviceLabel: 'Gerätebezeichnung',
    devicePlaceholder: 'z. B. Moto G Power (2022)',
    deviceClass: 'Grenzwertklasse',
    desktop: 'Desktop',
    phone: 'Smartphone',
    run: 'Kalte + 3 warme Ableitungen starten',
    cancel: 'Aktiven Lauf abbrechen',
    cancellation: 'Abbruch prüfen',
    fallback: 'Ohne WebAssembly prüfen',
    export: 'Nachweis als JSON exportieren',
    results: 'Nachweis dieses Geräts',
    noResults: 'Benchmark starten, um Nachweise in diesem Browser zu erfassen.',
    matrix: 'Erforderliche Unterstützungsmatrix',
    thresholds: 'Bestanden-/Nicht-bestanden-Grenzen',
    status: 'Status',
    cold: 'Kalte Entsperrung',
    warm: 'Median warm',
    responsiveness: 'Größtes Hauptthread-Intervall',
    memory: 'Speicherzuwachs aktiv / verbleibend',
    reference: 'Nativer Referenzvektor',
    exact: 'Exaktes Sicherheitsprofil',
    cancellationResult: 'Abbruchprüfung',
    fallbackResult: 'Prüfung ohne WebAssembly',
    pending: 'Nicht ausgeführt',
    idle: 'Nicht ausgeführt',
    running: 'Läuft…',
    complete: 'Abgeschlossen',
    failed: 'Fehlgeschlagen',
    cancelled: 'Abgebrochen',
    memoryUnavailable: 'Browsermessung nicht verfügbar — manuell prüfen',
  },
} as const;

const locale = ref<Locale>(navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en');
const text = computed(() => copy[locale.value]);
const deviceLabel = ref('');
const deviceClass = ref<DeviceClass>('desktop');
const runState = ref<RunState>('idle');
const report = ref<BenchmarkReport | null>(null);
const failure = ref('');
const cancellationProbe = ref<{ durationMs: number; maxMainThreadGapMs: number; passed: boolean } | null>(null);
const fallbackProbe = ref<{ outcome: 'exact' | 'failed-closed' | 'unsafe'; detail: string } | null>(null);

class BenchmarkWorker {
  private readonly worker = new Worker(new URL('./argon2id.worker.ts', import.meta.url), { type: 'module' });
  private readonly pending = new Map<string, { resolve: (result: DerivationResult) => void; reject: (error: Error) => void }>();
  private readyResolve!: (ready: WorkerReady) => void;
  private readyReject!: (error: Error) => void;
  readonly ready = new Promise<WorkerReady>((resolve, reject) => {
    this.readyResolve = resolve;
    this.readyReject = reject;
  });

  constructor(disableWasm = false) {
    this.worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      if (response.type === 'ready') {
        this.readyResolve(response);
        return;
      }
      if (response.type === 'failure') {
        const error = new Error(`${response.name}: ${response.message}`);
        if (response.requestId) {
          this.pending.get(response.requestId)?.reject(error);
          this.pending.delete(response.requestId);
        } else {
          this.readyReject(error);
        }
        return;
      }
      this.pending.get(response.requestId)?.resolve(response);
      this.pending.delete(response.requestId);
    });
    this.worker.addEventListener('error', (event) => {
      this.readyReject(new Error(event.message));
    });
    this.worker.postMessage({ type: 'initialize', disableWasm });
  }

  derive(): Promise<DerivationResult> {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage({ type: 'derive', requestId, profile: PROFILE });
    });
  }

  terminate(reason = 'Worker terminated'): void {
    this.worker.terminate();
    const error = new Error(reason);
    this.pending.forEach(({ reject }) => reject(error));
    this.pending.clear();
    this.readyReject(error);
  }
}

let activeWorker: BenchmarkWorker | null = null;

function startHeartbeat(): { stop: () => number } {
  let previous = performance.now();
  let largestGap = 0;
  const interval = window.setInterval(() => {
    const now = performance.now();
    largestGap = Math.max(largestGap, now - previous);
    previous = now;
  }, 50);
  return {
    stop: () => {
      window.clearInterval(interval);
      return largestGap;
    },
  };
}

async function runBenchmark(): Promise<void> {
  runState.value = 'running';
  report.value = null;
  failure.value = '';
  const memoryBefore = await measureMemory();
  const heartbeat = startHeartbeat();
  const coldStartedAt = performance.now();

  try {
    activeWorker = new BenchmarkWorker();
    const runtime = await activeWorker.ready;
    const coldResult = await activeWorker.derive();
    const coldUnlockMs = performance.now() - coldStartedAt;
    const warmResults: DerivationResult[] = [];
    for (let index = 0; index < 3; index += 1) {
      warmResults.push(await activeWorker.derive());
    }
    const maxMainThreadGapMs = heartbeat.stop();
    const memoryWithWorker = await measureMemory();
    activeWorker.terminate('Benchmark derivations complete');
    activeWorker = null;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    const memoryAfter = await measureMemory();
    const liveWorkerGrowthBytes = memoryBefore.bytes !== null && memoryWithWorker.bytes !== null
      ? memoryWithWorker.bytes - memoryBefore.bytes
      : null;
    const retainedGrowthBytes = memoryBefore.bytes !== null && memoryAfter.bytes !== null
      ? memoryAfter.bytes - memoryBefore.bytes
      : null;
    const warmDerivationMs = warmResults.map((result) => result.durationMs);
    const warmMedianMs = median(warmDerivationMs);
    const allResults = [coldResult, ...warmResults];
    const latencyThresholds = THRESHOLDS[deviceClass.value];
    const verdicts: BenchmarkReport['verdicts'] = {
      coldUnlock: coldUnlockMs <= latencyThresholds.coldUnlockMs ? 'pass' : 'fail',
      warmMedian: warmMedianMs <= latencyThresholds.warmMedianMs ? 'pass' : 'fail',
      singleDerivation: allResults.every((result) => result.durationMs <= THRESHOLDS.maxSingleDerivationMs) ? 'pass' : 'fail',
      responsiveness: maxMainThreadGapMs <= THRESHOLDS.maxMainThreadGapMs ? 'pass' : 'fail',
      memory: retainedGrowthBytes === null || liveWorkerGrowthBytes === null
        ? 'manual'
        : retainedGrowthBytes <= THRESHOLDS.maxRetainedGrowthBytes
          && liveWorkerGrowthBytes <= THRESHOLDS.maxLiveWorkerGrowthBytes ? 'pass' : 'fail',
      reference: allResults.every((result) => result.matchesReference) ? 'pass' : 'fail',
      exactProfile: allResults.every((result) => result.profileExact) ? 'pass' : 'fail',
    };

    report.value = {
      capturedAt: new Date().toISOString(),
      deviceLabel: deviceLabel.value.trim() || 'unlabelled device',
      deviceClass: deviceClass.value,
      metadata: runtimeMetadata(),
      profile: PROFILE,
      thresholds: THRESHOLDS,
      runtime,
      coldDerivationMs: coldResult.durationMs,
      coldUnlockMs,
      warmDerivationMs,
      warmMedianMs,
      maxMainThreadGapMs,
      memoryBefore,
      memoryWithWorker,
      memoryAfter,
      liveWorkerGrowthBytes,
      retainedGrowthBytes,
      referenceMatchedEveryRun: allResults.every((result) => result.matchesReference),
      profileExactEveryRun: allResults.every((result) => result.profileExact),
      verdicts,
    };
    runState.value = 'complete';
  } catch (error) {
    heartbeat.stop();
    if ((runState.value as RunState) !== 'cancelled') {
      failure.value = error instanceof Error ? error.message : String(error);
      runState.value = 'failed';
    }
  } finally {
    activeWorker?.terminate('Benchmark complete');
    activeWorker = null;
  }
}

function cancelBenchmark(): void {
  activeWorker?.terminate('Cancelled by the operator');
  activeWorker = null;
  runState.value = 'cancelled';
}

async function runCancellationProbe(): Promise<void> {
  cancellationProbe.value = null;
  const heartbeat = startHeartbeat();
  const worker = new BenchmarkWorker();
  activeWorker = worker;
  try {
    await worker.ready;
    void worker.derive().catch(() => undefined);
    window.setTimeout(() => {
      const cancellationStartedAt = performance.now();
      worker.terminate('Intentional cancellation probe');
      const durationMs = performance.now() - cancellationStartedAt;
      const maxMainThreadGapMs = heartbeat.stop();
      cancellationProbe.value = {
        durationMs,
        maxMainThreadGapMs,
        passed: durationMs <= THRESHOLDS.maxCancellationMs
          && maxMainThreadGapMs <= THRESHOLDS.maxMainThreadGapMs,
      };
      activeWorker = null;
    }, 150);
  } catch (error) {
    heartbeat.stop();
    failure.value = error instanceof Error ? error.message : String(error);
    activeWorker = null;
  }
}

async function runFallbackProbe(): Promise<void> {
  fallbackProbe.value = null;
  const worker = new BenchmarkWorker(true);
  activeWorker = worker;
  try {
    await worker.ready;
    const result = await worker.derive();
    fallbackProbe.value = result.matchesReference && result.profileExact
      ? { outcome: 'exact', detail: `Derived the reference key in ${formatMs(result.durationMs)}.` }
      : { outcome: 'unsafe', detail: 'The no-WebAssembly path returned a non-reference result or changed the fixed profile.' };
  } catch (error) {
    fallbackProbe.value = {
      outcome: 'failed-closed',
      detail: `Pinned runtime refused to initialize or derive: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    worker.terminate('Fallback probe complete');
    activeWorker = null;
  }
}

function formatMs(value: number): string {
  return `${Math.round(value)} ms`;
}

function formatBytes(value: number | null): string {
  if (value === null) return text.value.memoryUnavailable;
  const sign = value < 0 ? '−' : '';
  return `${sign}${(Math.abs(value) / 1024 / 1024).toFixed(1)} MiB`;
}

function downloadReport(): void {
  if (!report.value) return;
  const payload = {
    ...report.value,
    cancellationProbe: cancellationProbe.value,
    fallbackProbe: fallbackProbe.value,
  };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `argon2id-unlock-${new Date().toISOString().replaceAll(':', '-')}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function verdictClass(verdict: string | undefined): string {
  return verdict ? `verdict verdict--${verdict}` : 'verdict';
}

onBeforeUnmount(() => activeWorker?.terminate('Prototype unmounted'));
</script>

<template>
  <main class="prototype">
    <header class="hero">
      <div>
        <p class="eyebrow">{{ text.eyebrow }}</p>
        <h1>{{ text.title }}</h1>
        <p class="intro">{{ text.intro }}</p>
      </div>
      <div class="language" aria-label="Language / Sprache">
        <button type="button" :aria-pressed="locale === 'en'" @click="locale = 'en'">EN</button>
        <button type="button" :aria-pressed="locale === 'de'" @click="locale = 'de'">DE</button>
      </div>
    </header>

    <p class="warning">{{ text.warning }}</p>

    <section class="profile-card">
      <div>
        <span class="section-label">{{ text.profile }}</span>
        <strong>{{ PROFILE.algorithmVersion }}</strong>
      </div>
      <dl>
        <div><dt>Runtime</dt><dd>{{ PROFILE.runtime }}</dd></div>
        <div><dt>Output</dt><dd>{{ PROFILE.outputLength }} bytes</dd></div>
        <div><dt>opslimit</dt><dd>{{ PROFILE.opslimit }}</dd></div>
        <div><dt>memlimit</dt><dd>67,108,864 bytes · 64 MiB</dd></div>
      </dl>
    </section>

    <div class="workspace">
      <section class="panel controls">
        <h2>{{ text.environment }}</h2>
        <label>
          <span>{{ text.deviceLabel }}</span>
          <input v-model="deviceLabel" type="text" :placeholder="text.devicePlaceholder" />
        </label>
        <fieldset>
          <legend>{{ text.deviceClass }}</legend>
          <label class="radio"><input v-model="deviceClass" type="radio" value="desktop" /> {{ text.desktop }}</label>
          <label class="radio"><input v-model="deviceClass" type="radio" value="phone" /> {{ text.phone }}</label>
        </fieldset>
        <button class="primary" type="button" :disabled="runState === 'running'" @click="runBenchmark">
          {{ text.run }}
        </button>
        <button v-if="runState === 'running'" class="danger" type="button" @click="cancelBenchmark">
          {{ text.cancel }}
        </button>
        <div class="secondary-actions">
          <button type="button" :disabled="Boolean(activeWorker)" @click="runCancellationProbe">{{ text.cancellation }}</button>
          <button type="button" :disabled="Boolean(activeWorker)" @click="runFallbackProbe">{{ text.fallback }}</button>
        </div>
        <button type="button" :disabled="!report" @click="downloadReport">{{ text.export }}</button>
      </section>

      <section class="panel evidence" aria-live="polite">
        <div class="panel-heading">
          <h2>{{ text.results }}</h2>
          <span :class="verdictClass(runState)">{{ text[runState] }}</span>
        </div>
        <p v-if="!report" class="empty">{{ failure || text.noResults }}</p>
        <dl v-else class="results-grid">
          <div>
            <dt>{{ text.cold }}</dt>
            <dd>{{ formatMs(report.coldUnlockMs) }}</dd>
            <span :class="verdictClass(report.verdicts.coldUnlock)">{{ report.verdicts.coldUnlock }}</span>
          </div>
          <div>
            <dt>{{ text.warm }}</dt>
            <dd>{{ formatMs(report.warmMedianMs) }}</dd>
            <span :class="verdictClass(report.verdicts.warmMedian)">{{ report.verdicts.warmMedian }}</span>
          </div>
          <div>
            <dt>{{ text.responsiveness }}</dt>
            <dd>{{ formatMs(report.maxMainThreadGapMs) }}</dd>
            <span :class="verdictClass(report.verdicts.responsiveness)">{{ report.verdicts.responsiveness }}</span>
          </div>
          <div>
            <dt>{{ text.memory }}</dt>
            <dd>{{ formatBytes(report.liveWorkerGrowthBytes) }} / {{ formatBytes(report.retainedGrowthBytes) }}</dd>
            <span :class="verdictClass(report.verdicts.memory)">{{ report.verdicts.memory }}</span>
          </div>
          <div>
            <dt>{{ text.reference }}</dt>
            <dd>{{ report.referenceMatchedEveryRun ? '95045343…0915700' : 'mismatch' }}</dd>
            <span :class="verdictClass(report.verdicts.reference)">{{ report.verdicts.reference }}</span>
          </div>
          <div>
            <dt>{{ text.exact }}</dt>
            <dd>{{ report.profileExactEveryRun ? '32 / 3 / 67,108,864' : 'changed' }}</dd>
            <span :class="verdictClass(report.verdicts.exactProfile)">{{ report.verdicts.exactProfile }}</span>
          </div>
        </dl>
        <div class="probe-results">
          <p><strong>{{ text.cancellationResult }}:</strong> {{ cancellationProbe ? `${formatMs(cancellationProbe.durationMs)} · ${cancellationProbe.passed ? 'pass' : 'fail'}` : text.pending }}</p>
          <p><strong>{{ text.fallbackResult }}:</strong> {{ fallbackProbe ? `${fallbackProbe.outcome} · ${fallbackProbe.detail}` : text.pending }}</p>
        </div>
      </section>
    </div>

    <section class="panel matrix">
      <h2>{{ text.matrix }}</h2>
      <table>
        <thead>
          <tr><th>Tier</th><th>Browser policy</th><th>Representative hardware</th><th>Required evidence</th></tr>
        </thead>
        <tbody>
          <tr><td>Lowest desktop</td><td>Chromium current−1, Firefox ESR, Safari current−1</td><td>2 logical cores, 4 GiB RAM</td><td>One run per engine</td></tr>
          <tr><td>Current desktop</td><td>Current Chromium, Firefox, Safari</td><td>Maintained x86-64 or ARM64 laptop</td><td>One run per engine</td></tr>
          <tr><td>Lowest Android</td><td>Chrome Android current−1</td><td>Supported 4 GiB phone</td><td>Physical low-end device</td></tr>
          <tr><td>Lowest iPhone</td><td>Safari on oldest iPhone receiving current iOS</td><td>Physical device</td><td>Mobile Safari, not simulator</td></tr>
          <tr><td>Current phones</td><td>Current Chrome Android and Mobile Safari</td><td>Current mid-range Android and iPhone</td><td>One run per platform</td></tr>
        </tbody>
      </table>
      <p class="matrix-note">A profile decision needs all matrix rows. One browser run is evidence, not acceptance.</p>
    </section>

    <section class="panel threshold-panel">
      <h2>{{ text.thresholds }}</h2>
      <ul>
        <li>Cold unlock: ≤ 4,000 ms desktop; ≤ 6,000 ms phone.</li>
        <li>Warm median: ≤ 3,000 ms desktop; ≤ 5,000 ms phone. No derivation may exceed 8,000 ms.</li>
        <li>Main-thread interval and hard Worker cancellation: ≤ 250 ms.</li>
        <li>Every run must reproduce the native reference bytes with output=32, opslimit=3, memlimit=67,108,864.</li>
        <li>No crash or allocation failure. Live-Worker growth should be ≤ 192 MiB and retained growth after termination ≤ 32 MiB; unavailable browser memory data requires a manual profiler capture.</li>
        <li>No-WebAssembly behavior may derive the same bytes at the same profile or fail closed; parameter downgrades are always a failure.</li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

:global(body) {
  margin: 0;
  min-width: 320px;
  background: #f2f5f3;
  color: #173329;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}

button,
input {
  font: inherit;
}

button {
  min-height: 2.65rem;
  border: 1px solid #b9c8c1;
  border-radius: 0.55rem;
  background: #fff;
  color: #173329;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.prototype {
  width: min(1180px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 3rem 0 5rem;
}

.hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 2rem;
}

.eyebrow,
.section-label {
  margin: 0 0 0.65rem;
  color: #31735c;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

h1 {
  max-width: 760px;
  margin: 0;
  font-size: clamp(2.3rem, 6vw, 4.8rem);
  letter-spacing: -0.055em;
  line-height: 0.98;
}

.intro {
  max-width: 780px;
  margin: 1.2rem 0 0;
  color: #496158;
  font-size: 1.12rem;
  line-height: 1.6;
}

.language {
  display: flex;
  overflow: hidden;
  flex: 0 0 auto;
  border: 1px solid #b9c8c1;
  border-radius: 0.55rem;
}

.language button {
  min-height: 2.2rem;
  padding: 0.35rem 0.65rem;
  border: 0;
  border-radius: 0;
}

.language button[aria-pressed='true'] {
  background: #173329;
  color: #fff;
}

.warning {
  margin: 2rem 0;
  padding: 0.85rem 1rem;
  border-left: 4px solid #e4a832;
  background: #fff8e7;
}

.profile-card,
.panel {
  border: 1px solid #d4ded9;
  border-radius: 0.9rem;
  background: rgb(255 255 255 / 82%);
  box-shadow: 0 12px 35px rgb(23 51 41 / 5%);
}

.profile-card {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 2rem;
  padding: 1.25rem 1.4rem;
}

.profile-card strong,
.profile-card .section-label {
  display: block;
}

.profile-card dl {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin: 0;
}

dt {
  color: #60766d;
  font-size: 0.78rem;
}

dd {
  margin: 0.28rem 0 0;
  font-weight: 750;
}

.workspace {
  display: grid;
  grid-template-columns: minmax(260px, 0.8fr) minmax(0, 2fr);
  gap: 1rem;
  margin-top: 1rem;
}

.panel {
  padding: 1.4rem;
}

.panel h2 {
  margin: 0 0 1.15rem;
  font-size: 1.05rem;
}

.controls,
.controls label:not(.radio) {
  display: grid;
  gap: 0.65rem;
}

.controls {
  align-content: start;
}

input[type='text'] {
  width: 100%;
  min-height: 2.65rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid #b9c8c1;
  border-radius: 0.55rem;
}

fieldset {
  display: flex;
  gap: 1rem;
  margin: 0.3rem 0 0.6rem;
  padding: 0;
  border: 0;
}

legend {
  margin-bottom: 0.5rem;
}

.primary {
  border-color: #225e49;
  background: #225e49;
  color: #fff;
  font-weight: 750;
}

.danger {
  border-color: #b83333;
  color: #9d2424;
}

.secondary-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.empty {
  min-height: 190px;
  color: #60766d;
}

.results-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 0;
}

.results-grid > div {
  position: relative;
  min-height: 115px;
  padding: 0.9rem;
  border: 1px solid #dbe4df;
  border-radius: 0.65rem;
  background: #f8faf9;
}

.results-grid dd {
  margin-top: 0.55rem;
  font-size: 1.08rem;
  overflow-wrap: anywhere;
}

.verdict {
  display: inline-flex;
  margin-top: 0.6rem;
  padding: 0.2rem 0.45rem;
  border-radius: 999px;
  background: #e8ecea;
  color: #4e6259;
  font-size: 0.68rem;
  font-weight: 850;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.verdict--pass,
.verdict--complete {
  background: #dff4e9;
  color: #17623f;
}

.verdict--fail,
.verdict--failed {
  background: #fde1df;
  color: #9d2424;
}

.verdict--manual,
.verdict--running {
  background: #fff0c9;
  color: #835c00;
}

.probe-results {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid #dbe4df;
  color: #496158;
  font-size: 0.84rem;
}

.probe-results p {
  margin: 0.45rem 0;
}

.matrix,
.threshold-panel {
  margin-top: 1rem;
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.87rem;
}

th,
td {
  padding: 0.7rem;
  border-bottom: 1px solid #dbe4df;
  text-align: left;
  vertical-align: top;
}

.matrix-note,
.threshold-panel li {
  color: #496158;
  line-height: 1.55;
}

@media (max-width: 800px) {
  .prototype {
    width: min(100% - 1rem, 1180px);
    padding-top: 1.5rem;
  }

  .hero,
  .profile-card,
  .workspace {
    grid-template-columns: 1fr;
  }

  .hero {
    display: grid;
  }

  .profile-card dl,
  .results-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 470px) {
  .profile-card dl,
  .results-grid,
  .secondary-actions {
    grid-template-columns: 1fr;
  }
}
</style>
