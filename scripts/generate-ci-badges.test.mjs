import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const scriptPath = path.resolve('scripts/generate-ci-badges.mjs');

test('publishes passing test counts and exact coverage decimals', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'elderflow-badges-'));
  const reportsDirectory = path.join(workspace, 'reports');
  const outputDirectory = path.join(workspace, 'badges');

  await writeSuiteReport(reportsDirectory, 'backend-unit', {
    numTotalTests: 142,
    numPassedTests: 142,
    numFailedTests: 0,
  }, 0, 87.35);
  await writeSuiteReport(reportsDirectory, 'frontend-unit', {
    numTotalTests: 96,
    numPassedTests: 96,
    numFailedTests: 0,
  }, 0, 91.2);
  await writeSuiteReport(reportsDirectory, 'backend-e2e', {
    numTotalTests: 24,
    numPassedTests: 24,
    numFailedTests: 0,
  }, 0);

  await execFileAsync(process.execPath, [
    scriptPath,
    '--reports', reportsDirectory,
    '--output', outputDirectory,
    '--sha', '0123456789abcdef',
    '--generated-at', '2026-08-30T12:00:00.000Z',
  ]);

  assert.deepEqual(await readJson(outputDirectory, 'backend-unit.json'), {
    schemaVersion: 1,
    label: 'Backend unit tests',
    message: '142 passing',
    color: 'brightgreen',
  });
  assert.deepEqual(await readJson(outputDirectory, 'frontend-unit-coverage.json'), {
    schemaVersion: 1,
    label: 'Frontend unit coverage',
    message: '91.2%',
    color: 'blue',
  });
  assert.deepEqual(await readJson(outputDirectory, 'metadata.json'), {
    sourceSha: '0123456789abcdef',
    generatedAt: '2026-08-30T12:00:00.000Z',
  });
  for (const fileName of [
    'backend-unit.json',
    'frontend-unit.json',
    'backend-e2e.json',
    'backend-unit-coverage.json',
    'frontend-unit-coverage.json',
  ]) {
    assertShieldsEndpoint(await readJson(outputDirectory, fileName));
  }
});

test('publishes failed and passed counts when a suite exits unsuccessfully', async () => {
  const { reportsDirectory, outputDirectory } = await createCompleteReportSet();
  await writeSuiteReport(reportsDirectory, 'backend-e2e', {
    numTotalTests: 142,
    numPassedTests: 139,
    numFailedTests: 3,
  }, 1);

  await generateBadges(reportsDirectory, outputDirectory);

  assert.deepEqual(await readJson(outputDirectory, 'backend-e2e.json'), {
    schemaVersion: 1,
    label: 'Backend e2e tests',
    message: '3 failed / 139 passed',
    color: 'red',
  });
});

test('marks a suite with zero executed tests as failed', async () => {
  const { reportsDirectory, outputDirectory } = await createCompleteReportSet();
  await writeSuiteReport(reportsDirectory, 'frontend-unit', {
    numTotalTests: 2,
    numPassedTests: 0,
    numFailedTests: 0,
    numPendingTests: 2,
  }, 0, 0);

  await generateBadges(reportsDirectory, outputDirectory);

  assert.deepEqual(await readJson(outputDirectory, 'frontend-unit.json'), {
    schemaVersion: 1,
    label: 'Frontend unit tests',
    message: '0 tests',
    color: 'red',
  });
});

test('publishes unavailable endpoints for missing or malformed reports', async () => {
  const { reportsDirectory, outputDirectory } = await createCompleteReportSet();
  await rm(path.join(reportsDirectory, 'backend-e2e', 'test-results.json'));
  await writeFile(
    path.join(reportsDirectory, 'backend-unit', 'coverage-summary.json'),
    '{ malformed',
  );

  await generateBadges(reportsDirectory, outputDirectory);

  assert.deepEqual(await readJson(outputDirectory, 'backend-e2e.json'), {
    schemaVersion: 1,
    label: 'Backend e2e tests',
    message: 'unavailable',
    color: 'lightgrey',
  });
  assert.deepEqual(await readJson(outputDirectory, 'backend-unit-coverage.json'), {
    schemaVersion: 1,
    label: 'Backend unit coverage',
    message: 'unavailable',
    color: 'lightgrey',
  });
});

async function writeSuiteReport(reportsDirectory, suite, result, exitCode, coverage) {
  const suiteDirectory = path.join(reportsDirectory, suite);
  await mkdir(suiteDirectory, { recursive: true });
  await writeFile(path.join(suiteDirectory, 'test-results.json'), JSON.stringify(result));
  await writeFile(path.join(suiteDirectory, 'status.json'), JSON.stringify({ exitCode }));

  if (coverage !== undefined) {
    await writeFile(
      path.join(suiteDirectory, 'coverage-summary.json'),
      JSON.stringify({ total: { lines: { pct: coverage } } }),
    );
  }
}

async function readJson(directory, fileName) {
  return JSON.parse(await readFile(path.join(directory, fileName), 'utf8'));
}

async function createCompleteReportSet() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'elderflow-badges-'));
  const reportsDirectory = path.join(workspace, 'reports');
  const outputDirectory = path.join(workspace, 'badges');
  await writeSuiteReport(reportsDirectory, 'backend-unit', {
    numTotalTests: 1,
    numPassedTests: 1,
    numFailedTests: 0,
  }, 0, 80);
  await writeSuiteReport(reportsDirectory, 'frontend-unit', {
    numTotalTests: 1,
    numPassedTests: 1,
    numFailedTests: 0,
  }, 0, 80);
  await writeSuiteReport(reportsDirectory, 'backend-e2e', {
    numTotalTests: 1,
    numPassedTests: 1,
    numFailedTests: 0,
  }, 0);
  return { reportsDirectory, outputDirectory };
}

async function generateBadges(reportsDirectory, outputDirectory) {
  await execFileAsync(process.execPath, [
    scriptPath,
    '--reports', reportsDirectory,
    '--output', outputDirectory,
    '--sha', '0123456789abcdef',
    '--generated-at', '2026-08-30T12:00:00.000Z',
  ]);
}

function assertShieldsEndpoint(value) {
  assert.deepEqual(Object.keys(value), ['schemaVersion', 'label', 'message', 'color']);
  assert.equal(value.schemaVersion, 1);
  assert.equal(typeof value.label, 'string');
  assert.equal(typeof value.message, 'string');
  assert.equal(typeof value.color, 'string');
}
