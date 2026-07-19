import { describe, expect, it } from "vitest";
import {
  canonicalTopicTypes,
  creatableTopicTypes,
  resolveTopicType,
  topicTypeRegistry,
} from "./topicTypeRegistry";

describe("Topic type registry", () => {
  it("registers every canonical type exhaustively for all five contexts", () => {
    expect(Object.keys(topicTypeRegistry)).toEqual(canonicalTopicTypes);
    for (const type of canonicalTopicTypes) {
      expect(Object.keys(topicTypeRegistry[type].renderers).sort()).toEqual([
        "agenda",
        "detail",
        "form",
        "list",
        "preparation",
      ]);
    }
  });

  it("only exposes Generic for creation until specialized capabilities land", () => {
    expect(creatableTopicTypes()).toEqual(["generic"]);
  });

  it("never falls back to Generic for an unknown server value", () => {
    expect(resolveTopicType("legacy-category")).toBeNull();
  });
});
