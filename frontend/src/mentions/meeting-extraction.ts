import { generateJSON } from "@tiptap/core";
import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import type * as Y from "yjs";
import { meetingFragmentId, readMeetingFragment } from "../e2ee/meeting-document-codec";
import { meetingRichTextExtensions } from "../components/meeting-rich-text-extensions";
import { extractMentions } from "./extraction";

export function extractMeetingMentions(
  document: Y.Doc,
  appearances: readonly { id: string; topic?: { type?: string } }[],
  locale: "en" | "de",
) {
  return appearances.map((appearance) => {
    const fragment = meetingFragmentId(appearance.topic?.type === "person" ? "personNote" : "meetingMinutes", appearance.id);
    const xml = document.getXmlFragment(`tiptap:${fragment}`);
    const structured = xml.length ? yXmlFragmentToProsemirrorJSON(xml)
      : generateJSON(readMeetingFragment(document, fragment), meetingRichTextExtensions());
    return { appearanceId: appearance.id, mentions: extractMentions(structured, locale) };
  });
}
