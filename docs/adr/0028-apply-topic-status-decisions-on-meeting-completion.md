# Apply Topic status decisions on Meeting completion

Done and Postponed in the Agenda persist an explicit Meeting-owned `topicStatusDecision` on the appearance. Its values are `done`, `deferred`, or null (no decision, including cancellation). This structural metadata is server-managed and separate from the appearance workflow status, the long-lived Topic status, and encrypted Collaborative text. Switching replaces the decision; toggling the selected action cancels it. Minutes remain editable until completion.

After the existing completion barrier settles Collaborative text, completion applies only explicit decisions in the same database transaction as snapshots, the completed document sequence, and the Meeting status. Topic updates touch only status. Failed completion rolls everything back and retains decisions for retry. Completed Meetings retain decisions for history but reject further mutations and duplicate completion, preventing replay over subsequent Topic edits.

Other unfinished appearances never suppress a decision or get rewritten. Each Meeting applies its own final explicit decision when it completes, regardless of its scheduled date. A Meeting without a decision does not write Topic status. Connected participants receive an agenda-change notification and refresh structural data without replacing the collaborative document. Successful collaboration authentication also refreshes structural data, covering decisions changed during a disconnect.

## Existing-data compatibility

Migration `1720000020000-MeetingTopicStatusDecisions` adds a nullable, constrained column without backfilling or changing existing data. Existing `status`, `deferredAt`, snapshots, and Topic statuses retain their previous meaning. In-progress Meetings start with no pending decisions; previously performed actions already affected the global Topic and are not inferred or replayed at completion. Users must explicitly select a new decision to apply it on completion. Deploy the migration before the new API and frontend together; refresh existing browser sessions so Agenda actions use the new contract.

Completed legacy records keep their existing workflow and deferral markers. New completions preserve the explicit decision and materialize the existing Done/deferral markers for historical compatibility. Standalone Topic editing, recurrence scheduling, appearance order, sections, and planned durations retain their existing behavior.
