import { Extension, textInputRule } from "@tiptap/core";

export const RightArrowShortcut = Extension.create({
  name: "rightArrowShortcut",
  addInputRules() {
    return [textInputRule({ find: /-->$/, replace: "→" })];
  },
});
