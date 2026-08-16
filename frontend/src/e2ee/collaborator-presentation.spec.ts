import { describe, expect, it } from "vitest";
import {
  createCollaboratorPresentation,
  isCollaboratorPresentation,
} from "./collaborator-presentation";

describe("collaborator presentation", () => {
  it("derives stable initials and a color from the complete name", () => {
    const daniel = createCollaboratorPresentation({
      id: "daniel",
      firstName: "Daniel",
      lastName: "Haas",
    });

    expect(daniel).toMatchObject({
      id: "daniel",
      name: "Daniel Haas",
      initials: "DH",
    });
    expect(daniel.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(createCollaboratorPresentation({
      id: "another-session",
      firstName: " Daniel ",
      lastName: "HAAS",
    }).color).toBe(daniel.color);
    expect(createCollaboratorPresentation({
      id: "another-user",
      firstName: "Daria",
      lastName: "Haas",
    }).color).not.toBe(daniel.color);
  });

  it("accepts only safe presentation metadata from awareness messages", () => {
    expect(isCollaboratorPresentation({
      id: "user",
      name: "Daniel Haas",
      initials: "DH",
      color: "#315a9b",
    })).toBe(true);
    expect(isCollaboratorPresentation({
      id: "user",
      name: "Daniel Haas",
      initials: "DH",
      color: "url(javascript:alert(1))",
    })).toBe(false);
  });
});
