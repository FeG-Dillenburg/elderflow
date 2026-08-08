export const PROFILE = {
  id: 'elderflow-shared-passphrase-v1',
  runtime: 'libsodium-wrappers-sumo@0.7.16',
  algorithm: 'crypto_pwhash_ALG_ARGON2ID13',
  algorithmVersion: 'Argon2id v1.3',
  outputLength: 32,
  opslimit: 3,
  memlimit: 67_108_864,
  saltHex: '000102030405060708090a0b0c0d0e0f',
  passphrase: 'ElderFlow benchmark v1 — Grüße',
  expectedHex: '95045343ed5c18bc0ec4512e50155ec50df15be6eaa4ee04255b8c8550915700',
  expectedSource: 'PyNaCl 1.6.2 / native libsodium',
} as const;

export type DeviceClass = 'desktop' | 'phone';

export const THRESHOLDS = {
  desktop: {
    coldUnlockMs: 4_000,
    warmMedianMs: 3_000,
  },
  phone: {
    coldUnlockMs: 6_000,
    warmMedianMs: 5_000,
  },
  maxSingleDerivationMs: 8_000,
  maxMainThreadGapMs: 250,
  maxCancellationMs: 250,
  maxLiveWorkerGrowthBytes: 192 * 1024 * 1024,
  maxRetainedGrowthBytes: 32 * 1024 * 1024,
} as const;

export interface RuntimeMetadata {
  userAgent: string;
  language: string;
  hardwareConcurrency: number | null;
  deviceMemoryGiB: number | null;
  crossOriginIsolated: boolean;
}

export interface WorkerReady {
  type: 'ready';
  sodiumVersion: string;
  wasmAvailableBeforeProbe: boolean;
  wasmDisabledForProbe: boolean;
  initializationMs: number;
}

export interface DerivationResult {
  type: 'result';
  requestId: string;
  durationMs: number;
  outputHex: string;
  matchesReference: boolean;
  profileExact: boolean;
}

export interface WorkerFailure {
  type: 'failure';
  requestId: string | null;
  name: string;
  message: string;
}

export type WorkerResponse = WorkerReady | DerivationResult | WorkerFailure;

export interface MemorySnapshot {
  source: 'measureUserAgentSpecificMemory' | 'performance.memory' | 'unavailable';
  bytes: number | null;
}

export interface BenchmarkReport {
  capturedAt: string;
  deviceLabel: string;
  deviceClass: DeviceClass;
  metadata: RuntimeMetadata;
  profile: typeof PROFILE;
  thresholds: typeof THRESHOLDS;
  runtime: WorkerReady;
  coldDerivationMs: number;
  coldUnlockMs: number;
  warmDerivationMs: number[];
  warmMedianMs: number;
  maxMainThreadGapMs: number;
  memoryBefore: MemorySnapshot;
  memoryWithWorker: MemorySnapshot;
  memoryAfter: MemorySnapshot;
  liveWorkerGrowthBytes: number | null;
  retainedGrowthBytes: number | null;
  referenceMatchedEveryRun: boolean;
  profileExactEveryRun: boolean;
  verdicts: Record<string, 'pass' | 'fail' | 'manual'>;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function runtimeMetadata(): RuntimeMetadata {
  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    deviceMemoryGiB: navigatorWithMemory.deviceMemory ?? null,
    crossOriginIsolated: globalThis.crossOriginIsolated,
  };
}

export async function measureMemory(): Promise<MemorySnapshot> {
  const performanceWithMemory = performance as Performance & {
    measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
    memory?: { usedJSHeapSize: number };
  };

  if (performanceWithMemory.measureUserAgentSpecificMemory) {
    try {
      const result = await performanceWithMemory.measureUserAgentSpecificMemory();
      return { source: 'measureUserAgentSpecificMemory', bytes: result.bytes };
    } catch {
      // Chromium can expose the function while policy or platform support rejects it.
    }
  }

  if (performanceWithMemory.memory) {
    return { source: 'performance.memory', bytes: performanceWithMemory.memory.usedJSHeapSize };
  }

  return { source: 'unavailable', bytes: null };
}
