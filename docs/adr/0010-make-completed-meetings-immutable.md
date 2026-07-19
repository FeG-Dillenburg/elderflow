# Make completed Meetings immutable

Completing a Meeting creates a hard historical boundary: its details, agenda composition and order, durations, participants, Meeting topic notes, type-specific values, and Minutes entries can no longer be changed. The backend enforces this invariant and the frontend presents the completed record as read-only, ensuring that Meeting topic snapshots and minutes remain consistent; reopening or correcting a completed Meeting is intentionally deferred to a separate future workflow.
