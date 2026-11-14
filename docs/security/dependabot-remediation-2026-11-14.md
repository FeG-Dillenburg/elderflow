# November 2026 dependency remediation (#130)

Checked on **2026-11-14**, starting from `0d5c779` (`origin/main`).

## Inventory and final graph

Refreshed all pages with `gh api --paginate 'repos/FeG-Dillenburg/elderflow/dependabot/alerts?state=open&per_page=100'`: 11 alerts, 10 with published fixes. Compared every corresponding version in `pnpm-lock.yaml` against each alert's affected range with node-semver (normalizing GitHub's comma-separated bounds to spaces and validating each range). No affected occurrence remains for the 10 patchable alerts.

| Package | Final resolved version(s) | Alerts | Result |
| --- | --- | --- | --- |
| joi | 18.3.2 | 170, 179 | Fixed |
| vue-i18n | 11.4.20 | 173, 176 | Fixed |
| @intlify/core-base | 11.4.20 | 174, 177 | Fixed |
| @intlify/shared | 11.4.20 | 175 | Fixed |
| qs | 6.17.1 | 171 | Fixed |
| glob | 7.2.3, 14.0.2 | 178 | No affected versions |
| minimatch | 3.1.5, 11.0.1 | 180 | No affected versions |
| deepmerge | 4.3.1 | 172 | Accepted no-fix exception |

Joi's declaration is pinned to 18.3.2; Vue I18n's declaration now has a `^11.4.20` floor and its compiler, core, shared and devtools family resolves together. No broad Intlify overrides are needed. The resolver also selected an existing Babel 7.29.13 peer context for ts-jest; direct tooling versions remain unchanged.

## Override compatibility

TypeORM's latest 0.3 release remains 0.3.31 (`glob ^10.5.0`); Nest CLI's latest 11 release remains 11.0.24 (`glob 13.0.6`). Moving these owning packages to new major lines is unnecessary for this maintenance change. The [override register](dependency-overrides.md) documents range-scoped overrides and their removal conditions. Unrelated overrides, including the Multer 2.5.0 fix from #124, remain intact. Already safe qs 6.17.1 paths are retained. Unaffected glob 7/minimatch 3 consumers keep their legacy APIs.

Reviewed actual installed callers and upstream [glob](https://github.com/isaacs/node-glob) / [minimatch](https://github.com/isaacs/minimatch) API documentation:

- TypeORM's directory class loader uses the CommonJS namespace's `glob.sync`; Nest's asset manager uses named `sync` with include/exclude, `cwd`, and directory traversal options. Jest's configuration discovery uses `glob.sync`; its reporter also consumes glob. js-beautify uses `globSync`.
- test-exclude 7 consumes named `minimatch`, `glob.sync`, and async `glob`, including `dot`, `nodir`, `ignore` and `posix`. EditorConfig uses named `Minimatch` and `escape` with Windows-path escaping. The corresponding exports remain available in the fixed majors. Legacy test-exclude 6 keeps its callable glob/minimatch APIs through the unaffected legacy versions.
- Disposable fixtures exercised actual TypeORM class loading through nested `**/entity.js` patterns, sync/async directory traversal, default dotfile exclusion, explicit dotfile inclusion, ignored spec files, test-exclude sync/async filtering, EditorConfig brace matching in nested/hidden directories, and js-beautify formatting. All passed. Nest builds also copied the deployment-update manifest successfully.
- glob 14.0.2 and minimatch 11.0.1 declare Node `18 || 20 || >=22`; the production Node 22 image is exercised below.

No application patterns accept user-controlled globs or AbortSignals. Joi remains startup configuration validation; no multiple-email input was introduced. Translations remain repository-owned and text-rendered, with existing rich-text sanitization. No comma-array qs stringify mode was added. This is preventive maintenance, not evidence of exploitation.

## Accepted deepmerge exception

On 2026-11-14, npm reports latest deepmerge **4.3.1** and [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) still reports no patched version for `>=4.2.0, <=4.3.1`. Leave it unchanged under the ticket's explicit exception. It remains development-only through Jest configuration and Nest's webpack type-checking tooling, with no identified attacker-controlled merge path. Inspection of the built production image confirms deepmerge is absent. Alert #172 is unresolved and was not dismissed.

## Validation

- `pnpm install --frozen-lockfile` passes.
- Production backend `tsc -p tsconfig.build.json --noEmit`, frontend `vue-tsc --noEmit`, and `pnpm build` pass. Existing Vite crypto externalization and chunk-size warnings remain.
- Unrestricted backend `tsc --noEmit` reports frontend `import.meta`, ES2022 `at`, and `Intl.Segmenter` errors through test imports. The identical errors reproduce in a separate clean `origin/main` worktree with its original frozen dependencies; no TypeScript configuration change is included.
- Full root `pnpm test` passes: 72 backend suites / 291 tests; 98 frontend files / 716 tests, with 3 frontend files/tests skipped by existing conditions. Root dossier and CI-badge checks pass. Frontend coverage includes localization, dates, PrimeVue, and catalog parity; the catalog file also passed independently (3 tests).
- Backend `test:coverage` passes all 72 suites / 291 tests and produces its coverage report, exercising discovery and coverage filtering.
- PostgreSQL integration testing uses a new disposable PostgreSQL 16 container with no staging or production volumes. The first run passed 82 of 83 tests, with a transient tour HTTP 404 versus expected 400. The tour suite passed independently on both unchanged `origin/main` and this branch (5/5 each). The subsequent full PostgreSQL rerun passed all 14 suites / 83 tests.
- The actual Dockerfile builds successfully on Node 22.23.4, including frozen install, both production builds, and `pnpm --filter @elderflow/backend --prod deploy --legacy /app/backend`. Direct macOS deployment attempts outside the workspace hit pnpm temporary-path bin-linking errors; the container's production packaging path succeeds.
- The production-only image contains Joi 18.3.2, TypeORM's glob 14.0.2 and minimatch 11.0.1. Started it against the disposable database: all 28 explicit migrations loaded, `/health` returned 200, and restarting against the populated database again returned 200. Existing-data upgrade integration tests preserve their fixture data. No migration or schema files changed.

- Code review against `0d5c779`: Standards 0 findings; Spec 0 findings.

## Release follow-up

Deployment announcement omission is explicitly authorized in #130. No manifest entry or announcement translations are added.

After merge and GitHub's rescan, verify alerts **170, 171, 173–180** close. Keep **172** recorded as the accepted residual alert unless an upstream fixed release becomes available. Local graph validation does not mean GitHub has closed alerts. This change does not merge or deploy to staging/production.
