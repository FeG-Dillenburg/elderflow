# 29. Capture encrypted mentions through unlocked Meeting completion

Status: Accepted for issue #99.

Meeting completion now requires an unlocked completing browser. This supersedes the previous ability to complete while Protected text is locked; existing backend completion role permissions remain unchanged.

The multi-collaborator drain establishes an authoritative sequence before extraction. A separate, bounded finalization stage keeps the document frozen while the browser extracts and encrypts mention contexts. Prepare and submit use separate requests to avoid waiting for a submission within the request that must deliver the stable state.

Mention assignments are immutable per-appearance snapshots. Current mentions are a projection of the chronologically latest completed appearance, including empty snapshots, rather than a mutable assignment table. Completion click order does not determine assignment currency. No existing completed content is backfilled.

See [the envelope registry and protocol](../security/e2ee-mention-snapshots.md) for cryptographic contexts, access rules, and the limitation that the server cannot verify semantic extraction completeness without plaintext.
