import { expect, it } from "vitest";
import { Editor, getSchema } from "@tiptap/core";
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import * as Y from "yjs";
import { nextTick, reactive } from "vue";
import { meetingRichTextExtensions } from "../components/meeting-rich-text-extensions";
import { sanitizeRichText } from "../components/sanitize-rich-text";
import { auth } from "../auth/auth";
const id = "11111111-1111-4111-8111-111111111111";
const content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "mention", attrs: { id, label: "Daniel" } }] }] };

it("preserves UUID identity between collaborative documents, copy/paste, and sanitized readonly content", () => {
  const extensions = meetingRichTextExtensions();
  const source = new Y.Doc();
  const target = new Y.Doc();
  prosemirrorJSONToYXmlFragment(getSchema(extensions), content, source.getXmlFragment("text"));
  Y.applyUpdateV2(target, Y.encodeStateAsUpdateV2(source));
  const editor = new Editor({ extensions, content: yXmlFragmentToProsemirrorJSON(target.getXmlFragment("text")) });
  const html = sanitizeRichText(editor.getHTML());
  editor.commands.setContent(html);
  expect(editor.getJSON().content?.[0].content?.[0]).toMatchObject({ type: "mention", attrs: { id, label: "Daniel" } });
  editor.destroy(); source.destroy(); target.destroy();
});

it("updates personal editor styling with the viewer without serializing personal state", async () => {
  const viewer = reactive({ id });
  const editor = new Editor({ extensions: meetingRichTextExtensions(false, { viewer: () => viewer.id }), content });
  expect(editor.view.dom.querySelector(".mention-own")).not.toBeNull();
  expect(editor.getHTML()).not.toContain("mention-own");
  viewer.id = "other";
  await nextTick();
  expect(editor.view.dom.querySelector("[data-type=mention]")?.classList.contains("mention-own")).toBe(false);
  editor.destroy();
});

it("styles readonly UUID mentions for the viewer and rejects forged personal styling", () => {
  const previous = auth.state.user;
  auth.state.user = { id } as any;
  try {
    const safe = sanitizeRichText(`<p><span class="mention-own">plain</span><span data-type="mention" data-id="${id}" style="color:lime" onclick="alert(1)">@Daniel</span></p>`);
    expect(safe).toContain('class="mention mention-own"');
    expect(safe).not.toContain('style=');
    expect(safe).not.toContain('onclick');
    auth.state.user = { id: "other" } as any;
    expect(sanitizeRichText(safe)).not.toContain("mention-own");
  } finally { auth.state.user = previous; }
});
