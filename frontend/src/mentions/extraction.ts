import type { JSONContent } from "@tiptap/core";

export const mentionUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface ExtractedMention {
  userId: string;
  occurrence: number;
  context: string;
}

// ICU sentence boundaries are locale-aware but titles before capitalized names
// need an additional join (not a split at each full stop).
const titleEnding = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|Hr|Fr|bzw|ca|vgl|z|B|d|h)\.\s*$/u;

export function extractMentions(document: JSONContent, locale: "en" | "de"): ExtractedMention[] {
  const result: ExtractedMention[] = [];
  let occurrence = 0;
  const visit = (node: JSONContent) => {
    if (node.type !== "paragraph" && node.type !== "heading") {
      node.content?.forEach(visit);
      return;
    }
    let value = "";
    const mentions: { userId: string; offset: number }[] = [];
    const inline = (part: JSONContent) => {
      if (part.type === "mention" && mentionUuid.test(part.attrs?.id ?? "")) {
        mentions.push({ userId: part.attrs!.id.toLowerCase(), offset: value.length });
        value += `@${part.attrs?.label ?? ""}`;
      } else if (part.type === "text") value += part.text ?? "";
      else if (part.type === "hardBreak") value += "\n";
      else part.content?.forEach(inline);
    };
    node.content?.forEach(inline);
    const sentences: { index: number; segment: string }[] = [];
    for (const segment of new Intl.Segmenter(locale, { granularity: "sentence" }).segment(value)) {
      const previous = sentences.at(-1);
      if (previous && titleEnding.test(previous.segment)) previous.segment += segment.segment;
      else sentences.push({ index: segment.index, segment: segment.segment });
    }
    for (const sentence of sentences) {
      const users = new Set(mentions.filter((mention) => mention.offset >= sentence.index
        && mention.offset < sentence.index + sentence.segment.length).map((mention) => mention.userId));
      for (const userId of users) result.push({ userId, occurrence, context: sentence.segment.trim() });
      occurrence += 1;
    }
  };
  visit(document);
  return result;
}
