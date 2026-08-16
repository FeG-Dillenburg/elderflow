import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";

export const meetingRichTextExtensions = (collaborative = false) => [
  StarterKit.configure({ link: false, underline: false, undoRedo: collaborative ? false : {} }),
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  Underline,
  Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
];
