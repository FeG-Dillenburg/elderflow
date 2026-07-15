# Project Agent Guide

- The project language is English. Use English for code, comments, documentation, commit messages, and user-facing text.
- The repository is a pnpm workspace: `backend/` contains the NestJS and PostgreSQL API, `frontend/` contains the Vue 3 application, and `scripts/` contains repository tooling.
- Preserve a clear separation between backend and frontend responsibilities. Share contracts deliberately instead of coupling their implementations.
- Keep changes production-oriented, small, readable, and consistent with the existing architecture.
- Preserve the readable, expanded formatting used by Vue single-file components in `frontend/src/components/` and `frontend/src/views/`. Keep scripts, templates, and styles clearly structured across multiple lines; do not collapse Vue markup or declarations into dense one-line blocks when editing these files.
- Name issue branches `feature/<issue-number>-<short-description>` for features and `bug/<issue-number>-<short-description>` for bug fixes.
- Development identity is selected by `DEV_USER_EMAIL` and must stay disabled in production. Preserve the explicit boundary for a future OAuth2 implementation; do not turn development impersonation into production authentication.
- Admin, leadership, and read-only viewer permissions are enforced by the backend. Authorization must never rely only on hidden frontend controls.
- Do not introduce new business domains unless explicitly requested.
- Run the relevant tests and builds before finishing work. Prefer running the full root test suite when practical.
