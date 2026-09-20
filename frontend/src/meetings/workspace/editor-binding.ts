import { meetingFragmentId, type StableMeetingFragment } from "../../e2ee/meeting-document-codec";
import { meetingCollaboration } from "../../e2ee/meeting-collaboration";
import type { MeetingTextTarget, MeetingWorkspace } from "./core";

export const fragmentForMeetingTextTarget = (
  target: MeetingTextTarget,
): StableMeetingFragment => target.kind === "general_notes"
  ? "meeting/general-notes"
  : target.kind === "opening_input"
    ? "meeting/opening-input"
    : meetingFragmentId(
        target.kind === "meeting_topic_note"
          ? "personNote"
          : target.kind === "preparation_context"
            ? "preparationContext"
            : "meetingMinutes",
        target.appearanceId,
      );

export const meetingEditorBinding = (
  workspace: MeetingWorkspace,
  target: MeetingTextTarget,
) => {
  if (!workspace.state.meeting) return null;
  if (!workspace.text(target).editable) return null;
  const provider = meetingCollaboration.get(workspace.meetingId);
  if (!provider?.document) return null;
  const fragment = fragmentForMeetingTextTarget(target);
  return { provider, field: `tiptap:${fragment}` };
};
