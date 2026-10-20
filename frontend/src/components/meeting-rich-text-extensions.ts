import { mentionExtension, type MentionEditorOptions } from "../mentions/editor";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { RightArrowShortcut } from "./right-arrow-shortcut";

export const meetingRichTextExtensions = (collaborative = false, mentions: MentionEditorOptions = {}) => [
  StarterKit.configure({ link: false, underline: false, undoRedo: collaborative ? false : {} }),
  RightArrowShortcut,
  mentionExtension(mentions),
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  Underline,
  Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
];
