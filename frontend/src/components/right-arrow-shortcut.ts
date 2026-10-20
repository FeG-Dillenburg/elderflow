import { Extension, textInputRule } from "@tiptap/core";

export const RightArrowShortcut = Extension.create({
  name: "rightArrowShortcut",
  addInputRules() {
    const shortcut = "-->";
    return [textInputRule({
      find: (text) => text.endsWith(shortcut)
        ? { index: text.length - shortcut.length, text: shortcut }
        : null,
      replace: "→",
    })];
  },
});
