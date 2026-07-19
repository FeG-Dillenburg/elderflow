import { describe, expect, it } from "vitest";
import {
  canonicalTopicTypes,
  creatableTopicTypes,
  resolveTopicType,
  topicTypeRegistry,
  topicAgendaClass,
  topicUsesPlannedDuration,
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

  it("exposes Generic and the complete Person capability for creation", () => {
    expect(creatableTopicTypes()).toEqual(["generic", "person"]);
  });

  it("never falls back to Generic for an unknown server value", () => {
    expect(resolveTopicType("legacy-category")).toBeNull();
  });

  it("exposes compact agenda presentation as a type capability", () => {
    expect(topicAgendaClass("person")).toEqual([
      "agenda-topic",
      "agenda-topic-compact",
    ]);
    expect(topicAgendaClass("generic")).toEqual([
      "agenda-topic",
      "agenda-topic-standard",
    ]);
  });

  it("disables planned duration only for Person Topics", () => {
    expect(topicUsesPlannedDuration("person")).toBe(false);
    expect(topicUsesPlannedDuration("generic")).toBe(true);
  });
});
