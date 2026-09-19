import { describe, expect, it } from "vitest";
import agendaSource from "../../views/MeetingAgendaView.vue?raw";
import preparationSource from "../../views/MeetingPreparationView.vue?raw";
import richTextSource from "../../components/RichTextEditor.vue?raw";
import meetingTextSource from "../../topics/components/MeetingTextEditor.vue?raw";
import pairedTextsSource from "../../topics/components/PairedMeetingTexts.vue?raw";
import personNoteSource from "../../topics/types/person/PersonTopicNote.vue?raw";

const presentationSources = import.meta.glob<string>([
  "../../views/**/*.vue",
  "../../topics/**/*.vue",
  "../../components/**/*.vue",
], {
  eager: true,
  query: "?raw",
  import: "default",
});

describe("Meeting workspace architecture", () => {
  it("keeps Meeting views and presentation modules behind the workspace entry point", () => {
    for (const source of Object.values(presentationSources)) {
      expect(source).not.toMatch(/e2ee\/meeting-(?:collaboration|document-session)/);
      expect(source).not.toMatch(/\bmeeting(?:Collaboration|DocumentSession)\b/);
    }
    expect(agendaSource).toContain("useMeetingRoute");
    expect(preparationSource).toContain("useMeetingRoute");
  });

  it("keeps the generic rich-text editor unaware of Meetings and Yjs", () => {
    expect(richTextSource).not.toMatch(/\bmeetingId\b|\bfragment\b|\bYjs\b|from ["']yjs["']/);
    expect(richTextSource).not.toContain("meeting-collaboration");
    expect(richTextSource).not.toContain("@tiptap/extension-collaboration");
  });

  it("selects Collaborative text with domain targets instead of technical fragments", () => {
    expect(pairedTextsSource).toContain("preparation_context");
    expect(pairedTextsSource).toContain("meeting_minutes_text");
    expect(personNoteSource).toContain("meeting_topic_note");
    for (const source of [meetingTextSource, pairedTextsSource, personNoteSource]) {
      expect(source).not.toContain("meetingFragmentId");
    }
  });
});
