# Store topic-type fields as columns on topics

All Topic types share the `topics` table, and type-specific information is stored in explicit nullable, typed columns with type-aware validation. This keeps shared Topic data easy to manage while preserving database constraints, queryability, and TypeScript contracts; separate subtype tables and a JSONB property bag were rejected because they would either fragment the shared model or move its schema and validation out of the database.
