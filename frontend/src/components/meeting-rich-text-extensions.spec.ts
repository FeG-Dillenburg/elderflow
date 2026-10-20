import { Editor } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import * as Y from "yjs";
import { afterEach, describe, expect, it } from "vitest";
import { meetingRichTextExtensions } from "./meeting-rich-text-extensions";

const editors: Editor[] = [];
const documents: Y.Doc[] = [];

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
  documents.splice(0).forEach((document) => document.destroy());
});

function createEditor(collaborative = false): Editor {
  const document = new Y.Doc();
  documents.push(document);
  const editor = new Editor({
    extensions: [
      ...meetingRichTextExtensions(collaborative),
      ...(collaborative ? [Collaboration.configure({ document, field: "note" })] : []),
    ],
  });
  editors.push(editor);
  return editor;
}

// Dispatch typing through the same public ProseMirror input handlers used by the browser.
function typeText(editor: Editor, text: string): void {
  for (const character of text) {
    const { from, to } = editor.state.selection;
    const insert = () => editor.state.tr.insertText(character, from, to);
    const handled = editor.view.someProp("handleTextInput", (handler) =>
      handler(editor.view, from, to, character, insert),
    );
    if (!handled) editor.view.dispatch(insert());
  }
}

describe("editor arrow shortcut", () => {
  it("replaces a typed --> with a right arrow while preserving the surrounding text", () => {
    const editor = createEditor();
    typeText(editor, "Next step -->");
    expect(editor.getText()).toBe("Next step →");
  });

  it("restores the typed characters when Backspace immediately follows the replacement", () => {
    const editor = createEditor();
    typeText(editor, "Next step -->");
    editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Backspace", bubbles: true, cancelable: true,
    }));
    expect(editor.getText()).toBe("Next step -->");
    typeText(editor, " continue");
    expect(editor.getText()).toBe("Next step --> continue");
  });

  it("converts and restores the shortcut in a collaborative editor", () => {
    const editor = createEditor(true);
    typeText(editor, "Discuss -->");
    expect(editor.getText()).toBe("Discuss →");
    editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Backspace", bubbles: true, cancelable: true,
    }));
    expect(editor.getText()).toBe("Discuss -->");
  });
});
