import { describe, expect, it } from "vitest";
import { buildNumberedAgenda } from "./agenda";
import type { AgendaSection, MeetingTopic } from "../api/domain";

describe("buildNumberedAgenda", () => {
  it("numbers sections and topics according to their stored positions", () => {
    const sections = [
      { id: "urgent", name: "Urgent", position: 2, isDefault: true },
      { id: "opening", name: "Opening", position: 1, isDefault: true },
    ] as AgendaSection[];
    const agenda = [
      { id: "second", sectionId: "opening", position: 2 },
      { id: "first", sectionId: "opening", position: 1 },
    ] as MeetingTopic[];

    const result = buildNumberedAgenda(sections, agenda);

    expect(result.map((group) => group.section.id)).toEqual([
      "opening",
      "urgent",
    ]);
    expect(
      result[0].items.map((item) => [item.id, item.displayNumber]),
    ).toEqual([
      ["first", "1.1"],
      ["second", "1.2"],
    ]);
  });

  it("does not mutate inputs, keeps empty sections, and omits unknown sections", () => {
    const sections = [
      { id: "two", name: "Two", position: 2, isDefault: false },
      { id: "one", name: "One", position: 1, isDefault: true },
    ] as AgendaSection[];
    const agenda = [
      { id: "later", sectionId: "one", position: 9 },
      { id: "first", sectionId: "one", position: 1 },
      { id: "unknown", sectionId: "missing", position: 1 },
    ] as MeetingTopic[];
    const originalSections = [...sections],
      originalAgenda = [...agenda];
    const result = buildNumberedAgenda(sections, agenda);
    expect(sections).toEqual(originalSections);
    expect(agenda).toEqual(originalAgenda);
    expect(
      result.map((group) => [
        group.number,
        group.section.id,
        group.items.map((item) => item.displayNumber),
      ]),
    ).toEqual([
      [1, "one", ["1.1", "1.2"]],
      [2, "two", []],
    ]);
  });
});
