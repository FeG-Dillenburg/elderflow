import { describe, expect, it } from "vitest";
import { extractMentions } from "./extraction";

const daniel = "11111111-1111-4111-8111-111111111111";
const silke = "22222222-2222-4222-8222-222222222222";
const text = (text: string) => ({ type: "text", text });
const mention = (id = daniel, label = "Daniel") => ({ type: "mention", attrs: { id, label } });
const paragraph = (...content: any[]) => ({ type: "paragraph", content });

describe("mention extraction", () => {
  it("captures complete context for each mentioned person without splitting titles", () => {
    const doc = { type: "doc", content: [paragraph(text("On Sunday "), mention(), text(" will talk with Mr. X and "), mention(silke, "Silke"), text("."))] };
    expect(extractMentions(doc, "en")).toEqual([
      { userId: daniel, occurrence: 0, context: "On Sunday @Daniel will talk with Mr. X and @Silke." },
      { userId: silke, occurrence: 0, context: "On Sunday @Daniel will talk with Mr. X and @Silke." },
    ]);
  });
});
it("keeps repeated sentence occurrences and block boundaries while deduplicating within a sentence", () => {
  const doc = { type: "doc", content: [
    paragraph(mention(), text(" and "), mention(), text(" prepare. Later "), mention(), text(" will call.")),
    { type: "bulletList", content: [{ type: "listItem", content: [paragraph(mention(), text(" will call."))] }] },
    paragraph(text("@Daniel ordinary text")),
  ] };
  expect(extractMentions(doc, "de")).toEqual([
    { userId: daniel, occurrence: 0, context: "@Daniel and @Daniel prepare." },
    { userId: daniel, occurrence: 1, context: "Later @Daniel will call." },
    { userId: daniel, occurrence: 2, context: "@Daniel will call." },
  ]);
});
