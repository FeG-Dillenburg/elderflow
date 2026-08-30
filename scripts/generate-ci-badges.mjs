import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const suiteDefinitions = [
  { directory: 'backend-unit', label: 'Backend unit tests', coverageLabel: 'Backend unit coverage' },
  { directory: 'frontend-unit', label: 'Frontend unit tests', coverageLabel: 'Frontend unit coverage' },
  { directory: 'backend-e2e', label: 'Backend e2e tests' },
];

const options = parseArguments(process.argv.slice(2));
await mkdir(options.output, { recursive: true });

for (const suite of suiteDefinitions) {
  const suiteDirectory = path.join(options.reports, suite.directory);
  const testResult = await readJson(path.join(suiteDirectory, 'test-results.json'));
  const status = await readJson(path.join(suiteDirectory, 'status.json'));
  await writeJson(
    path.join(options.output, `${suite.directory}.json`),
    createTestBadge(suite.label, testResult, status),
  );

  if (suite.coverageLabel) {
    const coverage = await readJson(path.join(suiteDirectory, 'coverage-summary.json'));
    await writeJson(
      path.join(options.output, `${suite.directory}-coverage.json`),
      createCoverageBadge(suite.coverageLabel, coverage),
    );
  }
}

await writeJson(path.join(options.output, 'metadata.json'), {
  sourceSha: options.sha,
  generatedAt: options.generatedAt,
});

function createTestBadge(label, result, status) {
  if (!isTestResult(result) || !Number.isInteger(status?.exitCode)) {
    return endpoint(label, 'unavailable', 'lightgrey');
  }

  const passed = result.numPassedTests;
  const failed = result.numFailedTests;
  const executed = passed + failed;
  const exitedSuccessfully = status.exitCode === 0;

  if (executed === 0) {
    return endpoint(label, '0 tests', 'red');
  }

  if (exitedSuccessfully && failed === 0) {
    return endpoint(label, `${passed} passing`, 'brightgreen');
  }

  return endpoint(label, `${failed} failed / ${passed} passed`, 'red');
}

function createCoverageBadge(label, coverage) {
  const percentage = coverage?.total?.lines?.pct;
  if (typeof percentage !== 'number' || !Number.isFinite(percentage)) {
    return endpoint(label, 'unavailable', 'lightgrey');
  }

  return endpoint(label, `${percentage}%`, 'blue');
}

function isTestResult(result) {
  const hasValidCounts = ['numTotalTests', 'numPassedTests', 'numFailedTests'].every(
    (field) => Number.isInteger(result?.[field]) && result[field] >= 0,
  );
  return hasValidCounts
    && result.numPassedTests + result.numFailedTests <= result.numTotalTests;
}

function endpoint(label, message, color) {
  return { schemaVersion: 1, label, message, color };
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArguments(argumentsList) {
  const values = {};
  for (let index = 0; index < argumentsList.length; index += 2) {
    values[argumentsList[index].replace(/^--/, '')] = argumentsList[index + 1];
  }

  const required = ['reports', 'output', 'sha', 'generated-at'];
  for (const name of required) {
    if (!values[name]) {
      throw new Error(`Missing required argument --${name}`);
    }
  }

  return {
    reports: values.reports,
    output: values.output,
    sha: values.sha,
    generatedAt: values['generated-at'],
  };
}
