import Mention from "@tiptap/extension-mention";
import { Plugin } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { SuggestionProps } from "@tiptap/suggestion";
import { watchEffect } from "vue";
import { mentionUuid } from "./extraction";

export interface MentionUser { id: string; firstName: string; lastName: string }
export interface MentionEditorOptions {
  users?: () => MentionUser[];
  viewer?: () => string | undefined;
  label?: () => string;
}

export function mentionExtension(options: MentionEditorOptions = {}) {
  const users = options.users ?? (() => []);
  const convert = (state: EditorState, allowEnd: boolean): Transaction | null => {
    const replacements: { from: number; to: number; user: MentionUser }[] = [];
    state.doc.descendants((node, position) => {
      if (!node.isText || node.marks.some((mark) => mark.type.name === "link" || mark.type.name === "code")) return;
      const value = node.text!;
      const tokens = /(^|[\s([{])@([\p{L}\p{M}]+(?:[-’'][\p{L}\p{M}]+)*)(?=$|[\s\p{P}])/gu;
      for (const match of value.matchAll(tokens)) {
        const end = match.index! + match[0].length;
        const from = position + match.index! + match[1].length;
        const resolved = state.doc.resolve(from);
        const before = resolved.parent.textBetween(0, resolved.parentOffset).at(-1);
        const after = state.doc.textBetween(position + end, Math.min(state.doc.content.size, position + end + 1));
        if (before && !/[\s([{]/u.test(before)) continue;
        if (after && (!/[\s\p{P}]/u.test(after) || /[-’'/_@#\p{Pc}]/u.test(after))) continue;
        if (value[end] === "." && /[\p{L}\p{M}\d]/u.test(value[end + 1] ?? "")) continue;
        if (end === value.length && !allowEnd) continue;
        const candidates = users().filter((user) => user.firstName.normalize("NFC").toLocaleLowerCase()
          === match[2].normalize("NFC").toLocaleLowerCase());
        if (candidates.length === 1) replacements.push({
          from: position + match.index! + match[1].length, to: position + end, user: candidates[0],
        });
      }
    });
    if (!replacements.length) return null;
    const transaction = state.tr;
    for (const entry of replacements.reverse()) transaction.replaceWith(entry.from, entry.to,
      state.schema.nodes.mention.create({ id: entry.user.id, label: entry.user.firstName }));
    return transaction;
  };
  return Mention.extend({
    parseHTML() {
      return [{ tag: 'span[data-type="mention"]', getAttrs: (element) =>
        mentionUuid.test(element.getAttribute("data-id") ?? "") ? null : false }];
    },
    addNodeView() {
      return ({ node }) => {
        const dom = document.createElement("span");
        dom.dataset.type = "mention";
        dom.dataset.id = node.attrs.id;
        dom.textContent = `@${node.attrs.label ?? ""}`;
        const stop = watchEffect(() => {
          dom.className = options.viewer?.() === node.attrs.id ? "mention mention-own" : "mention";
        });
        return { dom, destroy: stop, ignoreMutation: () => true };
      };
    },
    addProseMirrorPlugins() {
      return [...(this.parent?.() ?? []), new Plugin({
        appendTransaction: (transactions, _previous, state) => {
          if (!this.editor.isEditable || this.editor.view.composing
            || !transactions.some((transaction) => transaction.docChanged)
            || transactions.some((transaction) => transaction.getMeta("y-sync$"))) return null;
          return convert(state, false);
        },
        props: { handleDOMEvents: {
          blur: (view) => {
            if (!view.composing && this.editor.isEditable) {
              const transaction = convert(view.state, true);
              if (transaction) view.dispatch(transaction);
            }
            return false;
          },
        } },
      })];
    },
  }).configure({
    HTMLAttributes: { class: "mention" },
    suggestion: {
      shouldShow: ({ transaction }) => !transaction.getMeta("y-sync$"),
      items: ({ query }) => users().filter((user) =>
        `${user.firstName} ${user.lastName}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())),
      command: ({ editor, range, props }) => {
        editor.chain().focus().insertContentAt(range, [
          { type: "mention", attrs: { id: props.id, label: props.label } },
          { type: "text", text: " " },
        ]).run();
      },
      render: () => {
        let list: HTMLDivElement | null = null;
        let active = 0;
        let current: SuggestionProps<MentionUser>;
        const choose = (index: number) => {
          const user = current.items[index];
          if (user) current.command({ id: user.id, label: user.firstName });
        };
        const draw = (props: SuggestionProps<MentionUser>) => {
          current = props;
          if (!list) {
            list = document.createElement("div");
            list.className = "mention-suggestions";
            list.id = `mentions-${crypto.randomUUID()}`;
            list.setAttribute("role", "listbox");
            document.body.append(list);
          }
          list.setAttribute("aria-label", options.label?.() ?? "");
          list.replaceChildren();
          active = Math.min(active, Math.max(0, props.items.length - 1));
          props.items.forEach((user, index) => {
            const button = document.createElement("div");
            button.id = `${list!.id}-${index}`;
            button.setAttribute("role", "option");
            button.setAttribute("aria-selected", String(index === active));
            button.textContent = `${user.firstName} ${user.lastName}`;
            button.addEventListener("mousedown", (event) => { event.preventDefault(); choose(index); });
            list!.append(button);
          });
          const editor = props.editor.view.dom;
          editor.setAttribute("aria-controls", list.id);
          if (props.items.length) editor.setAttribute("aria-activedescendant", `${list.id}-${active}`);
          else editor.removeAttribute("aria-activedescendant");
          const rectangle = props.clientRect?.();
          if (rectangle) Object.assign(list.style, {
            position: "fixed", left: `${rectangle.left}px`, top: `${rectangle.bottom + 4}px`, zIndex: "1000",
          });
        };
        const close = () => {
          current?.editor.view.dom.removeAttribute("aria-controls");
          current?.editor.view.dom.removeAttribute("aria-activedescendant");
          list?.remove(); list = null;
        };
        return {
          onStart: draw,
          onUpdate: (props) => { active = 0; draw(props); },
          onKeyDown: ({ event }) => {
            if (event.key === "Escape") { close(); return true; }
            if (!list) return false;
            if (event.key === "Enter" && current.items[active]) { choose(active); return true; }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              active = (active + (event.key === "ArrowDown" ? 1 : -1) + current.items.length) % (current.items.length || 1);
              draw(current); return true;
            }
            return false;
          },
          onExit: close,
        };
      },
    },
  });
}
