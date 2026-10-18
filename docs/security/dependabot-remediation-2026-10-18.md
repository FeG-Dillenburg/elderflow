# October 2026 dependency remediation (#104)

Checked on **2026-10-18**, starting from `1fca347e83695c51bc89d88e605612cca8eb54cb`.

## Inventory and lockfile evidence

The complete open inventory was refreshed with `gh api --paginate "repos/FeG-Dillenburg/elderflow/dependabot/alerts?state=open&per_page=100"`: 28 alerts, unchanged from the issue. Each package version in the final lockfile was compared with every corresponding `security_vulnerability.vulnerable_version_range` using node-semver. All 26 alerts with published fixes have no affected occurrence remaining.

| Package | Final resolved version(s) | Alerts | Disposition |
| --- | --- | --- | --- |
| `handlebars` | 4.7.10 | #143, #144, #145 | Fixed in lockfile |
| `sprintf-js` | 1.0.3 | #142 | Accepted exception |
| `dompurify` | 3.4.16 | #121, #122, #125, #141 | Fixed in lockfile |
| `source-map-js` | 1.2.2 | #140 | Fixed in lockfile |
| `joi` | 18.2.9 | #119, #120, #124, #139 | Fixed in lockfile |
| `prosemirror-view` | 1.42.6 | #138 | Fixed in lockfile |
| `braces` | 3.0.3 | #137 | Accepted exception |
| `fast-uri` | 3.1.8 | #136 | Fixed in lockfile |
| `moment` | 2.31.0 | #135 | Fixed in lockfile |
| `brace-expansion` | 1.1.21, 2.1.7, 5.0.12 | #126, #127, #128, #129, #130, #131, #132, #133, #134 | Fixed in lockfile |
| `proxy-addr` | 2.0.8 | #123 | Fixed in lockfile |
| `multer` | 2.4.0 | #118 | Fixed in lockfile |

## Resolution choices

Joi and DOMPurify remain pinned direct dependencies. The existing scoped Nest/Multer override now selects 2.4.0; all unrelated overrides are preserved. Compatible transitive updates suffice for the other packages, including all three brace-expansion families and both Express proxy-addr paths. No dependency major upgrades or new overrides were needed.

ProseMirror view 1.42.6 requires the model patch 1.25.12. Updating the model throughout the graph is necessary: the initial mixed-model resolution failed existing collaborative paste/mention tests with a duplicate-model Fragment error. All Tiptap packages remain aligned at 3.30.5. The resolver also refreshed optional Watchman tooling (fb-watchman/bser) and the Jest pretty-format react-is patch. Multer no longer needs concat-stream/typedarray.

## Accepted exceptions

On 2026-10-18, `pnpm view braces version` returned **3.0.3** and `pnpm view sprintf-js version` returned **1.1.3**. GitHub advisory API metadata for [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) still reports `first_patched_version: null`, affecting all published versions. Thus neither has an available fixed release. Installed versions remain braces 3.0.3 and sprintf-js 1.0.3, as explicitly accepted in #104.

Development paths include Jest/ts-loader → micromatch 4.0.8 → braces 3.0.3, and Jest/Babel coverage tooling → @istanbuljs/load-nyc-config 1.1.0 → js-yaml 3.15.2 → argparse 1.0.10 → sprintf-js 1.0.3. `pnpm -r why braces sprintf-js --prod` returns no paths. The Docker build stage installs tooling, but the runtime stage receives only backend `--prod` dependencies and compiled frontend assets. No application input path to malicious tooling globs or format strings was identified. Alerts #137 and #142 remain open; no alerts were dismissed or suppressed.

## Compatibility validation

- Frozen install succeeds; backend `tsc --noEmit` and frontend `vue-tsc --noEmit` pass.
- Focused frontend tests: 6 files, 33 tests pass, covering catalog parity, rich-text editing, text drag/paste, mentions, and sanitized history.
- Runtime smoke checks against installed packages pass: the actual AppModule Joi schema accepts valid development/production settings and rejects invalid ports/URLs and missing production secrets; proxy-addr rejects arbitrary IPv4 clients for `::ffff:10.0.0.0/8` and `::/1`, while preserving a correctly mapped trusted subnet; Multer disk storage cleans an aborted multipart upload while an asynchronous destination callback is pending.
- DOMPurify sanitizes strings in both rich-text helpers; no `IN_PLACE` path exists. The reported DOM-node in-place advisories are not an identified application exploit path, but the package is updated regardless. ProseMirror paste handling is relevant and covered by existing editor/mention/drag-paste tests.
- The backend configures no custom proxy trust subnets and exposes no Multer/FileInterceptor upload route. The dependency behavior checks therefore require no application compatibility changes.
- `pnpm test` passes: 69 backend suites / 281 tests; 82 frontend files / 529 tests, with 3 frontend files/tests skipped by their existing conditions; root dossier and CI-badge checks also pass. Backend HTTP/WebSocket tests require running outside the sandbox, whose local socket restrictions otherwise produce `listen EPERM`.
- `pnpm build` passes for both workspaces. Existing Vite chunk-size warnings remain.
- Standards review: no hard violations; corrected the stale Multer version/removal condition in `dependency-overrides.md`. Specification review: no findings.

## Release follow-up

After merge and GitHub rescanning, verify that alerts #118–#136, #138–#141, and #143–#145 close. Keep #137 and #142 explicitly recorded as accepted exceptions until upstream fixes exist. The local lockfile result is not evidence that GitHub has rescanned or closed alerts. No merge or deployment is performed by this change.
