# Encrypted Task scalars

Issue #50 reuses the version 1 scalar envelope and write ledger introduced by issue #49. No second replay or idempotency table is created.

| Aggregate | Aggregate ID | Field | Field ID | Envelope column | Revision column |
| --- | ---: | --- | ---: | --- | --- |
| Task | 258 | title | 1 | `title_envelope` | `title_commit_revision` |
| Task | 258 | description | 2 | `description_envelope` | `description_commit_revision` |

Both Task columns use the same `<field>_envelope` and `<field>_commit_revision` convention as Topic scalars. Every accepted write is validated and deduplicated through the existing `e2ee_scalar_writes` table using `(client_epoch_id, record_id, field_id, write_counter)` and the Task aggregate ID. Title and description never have plaintext compatibility columns or a dual-write path.

Task, dashboard, Meeting-agenda, and Task-reference responses expose narrow structural/account projections. Content users receive only the Task envelopes and encrypted Topic name needed by the screen. Meeting labels remain an explicit localized unavailable value until the Meeting encryption slice. Guests and IT admins receive no Protected ciphertext.
