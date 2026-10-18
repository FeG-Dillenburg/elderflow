import { Editor } from "@tiptap/core";
import { afterEach, expect, it } from "vitest";
import { meetingRichTextExtensions } from "../components/meeting-rich-text-extensions";
const id = "11111111-1111-4111-8111-111111111111";
let editor: Editor;
afterEach(() => editor?.destroy());
it("converts a unique Unicode name on delimiter and preserves identity through HTML", () => {
  editor = new Editor({ extensions: meetingRichTextExtensions(false, {
    users: () => [{ id, firstName: "Éva-Marie", lastName: "Test" }],
  }) });
  editor.commands.insertContent("Before @éva-marie, after");
  expect(editor.getHTML()).toContain(`data-id="${id}"`);
  const html = editor.getHTML();
  editor.commands.setContent(html);
  expect(editor.getJSON().content?.[0].content?.[1]).toMatchObject({ type: "mention", attrs: { id, label: "Éva-Marie" } });
});
it("leaves ambiguous, unknown, email, URL, and partial names as ordinary text", () => {
  editor = new Editor({ extensions: meetingRichTextExtensions(false, {
    users: () => [{ id, firstName: "Daniel", lastName: "One" }, { id: "22222222-2222-4222-8222-222222222222", firstName: "Daniel", lastName: "Two" }],
  }) });
  editor.commands.insertContent("@Daniel @Unknown foo@Daniel.com https://example.org/@Daniel @Dan ");
  expect(editor.getHTML()).not.toContain('data-type="mention"');
});
it("converts an exact name at blur but not during composition", () => {
  editor = new Editor({ extensions: meetingRichTextExtensions(false, { users: () => [{ id, firstName: "Daniel", lastName: "Test" }] }) });
  editor.commands.insertContent("@Daniel");
  expect(editor.getHTML()).not.toContain('data-type="mention"');
  editor.view.dom.dispatchEvent(new FocusEvent("blur"));
  expect(editor.getHTML()).toContain(`data-id="${id}"`);
});
it("shows accessible full-name options and supports keyboard selection", async () => {
  editor = new Editor({ extensions: meetingRichTextExtensions(false, {
    users: () => [{ id, firstName: "Daniel", lastName: "Example" }], label: () => "Mention a person",
  }) });
  document.body.append(editor.view.dom);
  editor.view.dom.focus();
  editor.commands.insertContent("@Exam");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(document.querySelector('[role="listbox"]')?.getAttribute("aria-label")).toBe("Mention a person");
  expect(document.querySelector('[role="option"]')?.textContent).toBe("Daniel Example");
  expect(editor.view.dom.getAttribute("aria-activedescendant")).toBeTruthy();
  editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(editor.getHTML()).toContain(`data-id="${id}"`);
});
it("does not convert a mention-looking substring split across formatting", () => {
  editor = new Editor({ extensions: meetingRichTextExtensions(false, { users: () => [{ id, firstName: "Daniel", lastName: "Test" }] }) });
  editor.commands.insertContent('<p>word<strong>@Daniel </strong></p>');
  expect(editor.getHTML()).not.toContain('data-type="mention"');
});
it("recognizes Unicode sentence punctuation without consuming Enter for unknown names", async () => {
  editor = new Editor({ extensions: meetingRichTextExtensions(false, { users: () => [{ id, firstName: "Daniel", lastName: "Test" }] }) });
  editor.commands.insertContent("@Daniel—please @Daniel…");
  expect(editor.getJSON().content?.[0].content?.filter((node) => node.type === "mention")).toHaveLength(2);
  editor.commands.setContent("");
  document.body.append(editor.view.dom);
  editor.view.dom.focus();
  editor.commands.insertContent("@Unknown");
  await new Promise((resolve) => setTimeout(resolve, 0));
  editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(editor.getJSON().content).toHaveLength(2);
});
