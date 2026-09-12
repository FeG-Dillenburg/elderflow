# Dependency overrides

Root `pnpm.overrides` entries are limited to dependency paths whose upstream
metadata cannot currently produce the required compatible graph.

| Override | Reason and compatibility evidence | Removal condition |
| --- | --- | --- |
| `@nestjs/platform-express>multer = 2.3.0` | Nest 11.2.3 pins Multer 2.2.0 exactly. Multer 2.3.0 remains on the same major line, supports the project's Node 20 baseline, and preserves the middleware API used by Nest while fixing the advisories tracked in #75. | Remove when the installed Nest platform release depends on Multer 2.3.0 or newer. |
| `@tiptap/vue-3>@tiptap/extension-bubble-menu = 3.30.5` | Tiptap Vue 3.30.5 declares a caret dependency, which otherwise resolves a newer menu package whose exact Core and PM peers conflict with the aligned 3.30.5 family required by #75. | Remove when the complete direct Tiptap family is upgraded together beyond 3.30.5. |
| `@tiptap/vue-3>@tiptap/extension-floating-menu = 3.30.5` | Tiptap Vue 3.30.5 declares a caret dependency, which otherwise resolves a newer menu package whose exact Core and PM peers conflict with the aligned 3.30.5 family required by #75. | Remove when the complete direct Tiptap family is upgraded together beyond 3.30.5. |

The libsodium overrides are documented separately in
[`e2ee-key-dependencies.md`](./e2ee-key-dependencies.md).
