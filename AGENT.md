# Project Agent Guide

- The project language is English. Use English for code, comments, documentation, commit messages, and user-facing text.
- The repository is a pnpm workspace: `backend/` contains the NestJS and PostgreSQL API, `frontend/` contains the Vue 3 application, and `scripts/` contains repository tooling.
- Preserve a clear separation between backend and frontend responsibilities. Share contracts deliberately instead of coupling their implementations.
- Keep changes production-oriented, small, readable, and consistent with the existing architecture.
- Do not introduce authentication or new business domains unless explicitly requested.
- Run the relevant tests and builds before finishing work. Prefer running the full root test suite when practical.

