import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
const readme = await readFile('README.md', 'utf8');

test('runs CI for pull requests and pushes to main', () => {
  assert.match(workflow, /^name: CI$/m);
  assert.match(workflow, /^  pull_request:/m);
  assert.match(workflow, /^  push:\n    branches: \[main\]$/m);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
});

test('limits badge publication write permission to trusted main pushes', () => {
  assert.equal(workflow.match(/contents: write/g)?.length, 1);
  assert.match(
    workflow,
    /publish-badges:[\s\S]*?if: \$\{\{ always\(\) && github\.event_name == 'push' && github\.ref == 'refs\/heads\/main' \}\}/,
  );
  assert.match(workflow, /publish-badges:[\s\S]*?permissions:\n      contents: write/);
});

test('prevents older main runs from publishing after newer runs', () => {
  assert.match(workflow, /^concurrency:\n  group: ci-\$\{\{ github\.ref \}\}\n  cancel-in-progress: true$/m);
  assert.match(workflow, /git ls-remote origin refs\/heads\/main/);
  assert.match(workflow, /test "\$latest_sha" = "\$GITHUB_SHA"/);
});

test('uploads machine-readable reports even when a test suite fails', () => {
  assert.match(workflow, /--json --outputFile=.*test-results\.json/);
  assert.match(workflow, /--reporter=json --outputFile=.*test-results\.json/);
  assert.match(workflow, /--coverageReporters=json-summary/);
  assert.match(workflow, /--coverage\.reporter=json-summary/);
  assert.match(workflow, /name: ci-report-\$\{\{ matrix\.workspace \}\}-unit/);
  assert.match(workflow, /name: ci-report-backend-e2e/);
  assert.match(workflow, /name: ci-report-meeting-collaboration-e2e/);
  assert.equal(workflow.match(/uses: actions\/upload-artifact@v4/g)?.length, 3);
  assert.equal(workflow.match(/if: always\(\)/g)?.length, 4);
});

test('runs live two-client Meeting compaction against PostgreSQL', () => {
  assert.match(workflow, /collaboration-e2e:[\s\S]*?image: postgres:16-alpine/);
  assert.match(workflow, /collaboration-e2e:[\s\S]*?node backend\/dist\/main\.js/);
  assert.match(workflow, /collaboration-e2e:[\s\S]*?topic-slice-running-instance\.spec\.ts/);
  assert.match(workflow, /collaboration-e2e:[\s\S]*?e2ee-release-running-instance\.spec\.ts/);
  assert.match(workflow, /collaboration-e2e:[\s\S]*?E2EE_EVIDENCE_SETUP_PASSWORD/);
});

test('runs badge transformation tests and semantic workflow validation in CI', () => {
  assert.match(workflow, /badge-tooling:[\s\S]*?run: pnpm run test:ci-badges/);
  assert.match(workflow, /badge-tooling:[\s\S]*?uses: docker:\/\/rhysd\/actionlint:1\.7\.7/);
  assert.match(
    workflow,
    /publish-badges:[\s\S]*?needs: \[tests, e2e, collaboration-e2e, syntax, badge-tooling\]/,
  );
});

test('README links all six main-push badges to CI diagnostics', () => {
  assert.equal(readme.match(/actions\/workflows\/ci\.yml\?query=branch%3Amain\+event%3Apush/g)?.length, 6);
  assert.match(readme, /ci\.yml\/badge\.svg\?branch=main&event=push/);
  assert.equal(readme.match(/img\.shields\.io\/endpoint\?url=/g)?.length, 5);
  for (const endpoint of [
    'backend-unit',
    'frontend-unit',
    'backend-e2e',
    'backend-unit-coverage',
    'frontend-unit-coverage',
  ]) {
    assert.match(readme, new RegExp(`badges%2F${endpoint}\\.json`));
  }
});
