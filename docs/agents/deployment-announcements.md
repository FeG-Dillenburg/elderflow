# Deployment announcements

Every user-visible feature, improvement, and bug fix ships with an announcement in the same PR. Tickets state the intended category (`feature`, `improvement`, or `bugfix`) or an explicitly authorized omission. Work without user-visible effects, including documentation, tests, and internal refactors, may omit announcements only when the ticket explicitly permits it or Daniel agrees. See [the issue workflow](issue-tracker.md).

1. Append an entry to `backend/src/deployment-updates/manifest.json` with a descriptive, unique, stable `id` and supported `category`.
2. Add matching `deploymentUpdates.entries.<id>` copy to both frontend I18n catalogs. Keep old keys so stored history remains readable. A new language requires only catalog additions.
3. Run catalog-parity tests, backend/frontend tests, and builds.

Identifiers are immutable and cannot be reused for unrelated news. Correcting translated copy does not create another announcement or reset acknowledgements. A genuinely new announcement needs a new identifier.

At backend startup, after migrations, the manifest is validated and missing identifiers are inserted transactionally. The installation database generates the first deployment timestamp; never add dates or translated text to the manifest. Restarting, concurrent startup, reordering, or removing an entry does not alter existing records or read state. The compiled backend includes the JSON manifest; ticket/PR creation does not register anything.

Existing users receive the first announcement. Users created after the migration baseline the catalog on their first authenticated session. Continue acknowledges only displayed UUIDs; history selects the latest 50 and never acknowledges them. Unread history has no 50-entry cap. Very large unread sets are presented in pages of at most 1,000 entries; each Continue atomically acknowledges only its displayed page before the next one is shown. Unlock and tours wait until every page is acknowledged. Neither API requires Protected-text keys.
