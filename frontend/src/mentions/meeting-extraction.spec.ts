import { expect, it } from "vitest";
import * as Y from "yjs";
import { meetingFragmentId, replaceMeetingFragment } from "../e2ee/meeting-document-codec";
import { extractMeetingMentions } from "./meeting-extraction";
const id = "11111111-1111-4111-8111-111111111111";
const html = `<p>Before <span data-type="mention" data-id="${id}" data-label="Daniel">@Daniel</span> after.</p>`;
it("extracts only the eligible field for each Topic type, including unchanged carry-over", () => {
  const doc = new Y.Doc();
  const appearances = ["generic", "person", "new_membership", "recurring"].map((type, index) => ({ id: `00000000-0000-4000-8000-00000000000${index}`, topic: { type } }));
  replaceMeetingFragment(doc, "meeting/general-notes", html);
  replaceMeetingFragment(doc, "meeting/opening-input", html);
  for (const appearance of appearances) {
    replaceMeetingFragment(doc, meetingFragmentId("preparationContext", appearance.id), html);
    replaceMeetingFragment(doc, meetingFragmentId(appearance.topic.type === "person" ? "personNote" : "meetingMinutes", appearance.id), html);
  }
  const extracted = extractMeetingMentions(doc, appearances, "de");
  expect(extracted).toHaveLength(4);
  for (const appearance of extracted) expect(appearance.mentions).toEqual([{ userId: id, occurrence: 0, context: "Before @Daniel after." }]);
  replaceMeetingFragment(doc, meetingFragmentId("meetingMinutes", appearances[0].id), "<p>Nothing assigned.</p>");
  expect(extractMeetingMentions(doc, appearances, "de")[0].mentions).toEqual([]);
  doc.destroy();
});
