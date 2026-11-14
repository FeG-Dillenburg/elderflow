# Dependency overrides

Root `pnpm.overrides` entries are limited to dependency paths whose upstream
metadata cannot currently produce the required compatible graph.

| Override | Reason and compatibility evidence | Removal condition |
| --- | --- | --- |
| `@nestjs/platform-express>multer = 2.4.0` | Nest 11.2.3 pins Multer 2.2.0 exactly. Multer 2.4.0 remains on the same major line, supports the project's Node 20 baseline, and preserves the middleware API used by Nest while fixing the advisories tracked in #75 and the aborted-upload cleanup advisory in #104. | Remove when the installed Nest platform release depends on Multer 2.4.0 or newer. |
| `glob@>=9 <14.0.2 = 14.0.2` | #130: TypeORM 0.3.31, Nest CLI 11.0.24, Jest, js-beautify and test-exclude still constrain vulnerable majors. CommonJS named exports, `sync`/`globSync`, async `glob`, options and class loading are preserved; see the [validation report](dependabot-remediation-2026-11-14.md). Glob 7 consumers are untouched. | Remove when all affected parents declare glob 14.0.2 or newer. |
| `minimatch@>=7 <11.0.1 = 11.0.1` | #130: covers independent editorconfig/test-exclude paths and glob 14's `^11.0.0` floor. Named `minimatch`, `Minimatch`, and `escape` APIs remain compatible; dotfile, brace and ignore matching are exercised. Minimatch 3 consumers are untouched. | Remove when all affected parents require minimatch 11.0.1 or newer. |
| `qs@>=6.7.0 <6.16.1 = 6.17.1` | #130: fixes both Express and Superagent paths without downgrading body-parser's already safe 6.17.1. HTTP/API tests exercise existing query behavior. | Remove when all affected parents require qs 6.16.1 or newer. |
| `@tiptap/vue-3>@tiptap/extension-bubble-menu = 3.30.5` | Tiptap Vue 3.30.5 declares a caret dependency, which otherwise resolves a newer menu package whose exact Core and PM peers conflict with the aligned 3.30.5 family required by #75. | Remove when the complete direct Tiptap family is upgraded together beyond 3.30.5. |
| `@tiptap/vue-3>@tiptap/extension-floating-menu = 3.30.5` | Tiptap Vue 3.30.5 declares a caret dependency, which otherwise resolves a newer menu package whose exact Core and PM peers conflict with the aligned 3.30.5 family required by #75. | Remove when the complete direct Tiptap family is upgraded together beyond 3.30.5. |

The libsodium overrides are documented separately in
[`e2ee-key-dependencies.md`](./e2ee-key-dependencies.md).
