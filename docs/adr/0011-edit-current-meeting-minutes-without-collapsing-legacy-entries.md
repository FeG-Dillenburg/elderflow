# Edit current Meeting minutes without collapsing legacy entries

Meeting-linked `topic_updates` remain the persistence model for Minutes entries. For a Generic, New membership, or Recurring appearance, the latest entry in deterministic chronological order is the single current Meeting-minutes value exposed for direct editing. A first save creates that entry; later saves update it with optimistic version checks.

Older entries remain separate, byte-for-byte preserved, and chronologically ordered in Topic history. Existing appearances with one entry therefore expose that entry as current Minutes, while appearances with multiple entries expose the latest as current and retain every earlier entry as legacy Minutes history. Person appearances do not expose a current Meeting-minutes editor.

Meeting appearance notes remain stored on `meeting_topics`: they mean preparation context for Generic, New membership, and Recurring Topics, and the sole Meeting topic note for Person Topics. Optimistic versions are added to both persistence models without rewriting either text source.
