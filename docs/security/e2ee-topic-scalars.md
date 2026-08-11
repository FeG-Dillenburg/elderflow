# Protected Topic scalar registry and boundary

This document is the immutable numeric registry and data-flow boundary introduced by issue #49. Assigned aggregate and field values must never be reused or renumbered.

| Aggregate | Aggregate type | Protected field | Field ID |
| --- | ---: | --- | ---: |
| Topic | 256 | name | 1 |
| Topic | 256 | description | 2 |
| Topic | 256 | membership process status | 3 |
| Topic | 256 | godparents | 4 |
| Standalone Topic Update | 257 | text | 1 |

The browser is the only component that turns these values into plaintext. It validates locally, creates a UUID before a create request, derives the purpose-10 field key, pads, encrypts, and signs the scalar. The API accepts only the narrow structural DTO plus base64url envelopes, checks the public envelope context, active author epoch, signature, nonce counter, replay identity, and authorization, then stores the canonical envelope bytes with a server commit revision. It cannot open the ciphertext.

Topic list, detail, create, update, standalone-update, history, Meeting detail, and Meeting-suggestion ciphertext responses use `Cache-Control: no-store`. Admin, leadership, and ordinary content users may receive ciphertext. Guest and IT-admin roles never receive protected bytes. Locked clients render localized placeholders and disable plaintext search and writes. Unlocked list search and sort operate on the in-memory projection; ciphertext is never indexed as if it were plaintext.

Parent specification #47 user story 68 requires the first encrypted release to reset synthetic development content and start from a fresh installation; its out-of-scope section explicitly excludes in-place plaintext migration, compatibility reads, and dual writes. The migration therefore refuses to run only when a Topic row containing the replaced plaintext fields exists. It never truncates data itself, does not block unrelated Meeting or task rows, removes the Topic, standalone-update, and Protected appearance-snapshot plaintext columns, and refuses downgrade to plaintext storage.

Completing a Meeting copies the Topic name, membership-process, and godparents envelope bytes plus their commit revisions into immutable appearance snapshot columns; history and completed Meeting views decrypt those snapshots locally with the owning Topic context. Meeting-document preparation, Person-note, Minutes, and recurring-description copy-forward remain explicit unavailable values until the encrypted Meeting-workspace slice owns those values. That later slice performs copy-forward in the unlocked client; this Topic slice never substitutes empty plaintext or copies a Topic description on the server.

Scalar failures are fail-closed. Bad framing, context transplant, signature failure, revoked or foreign epochs, counter reuse with different bytes, decrypt/authentication failure, invalid decrypted schema, and an invalid decrypted Topic name never become null or empty data and are never autosaved over the original ciphertext.
