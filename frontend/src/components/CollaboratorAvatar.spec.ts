import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CollaboratorAvatar from "./CollaboratorAvatar.vue";

describe("CollaboratorAvatar", () => {
  const collaborator = {
    id: "daniel",
    name: "Daniel Haas",
    initials: "DH",
    color: "#315a9b",
  };

  it("renders accessible initials in the collaborator color", () => {
    const wrapper = mount(CollaboratorAvatar, { props: { collaborator } });

    expect(wrapper.text()).toBe("DH");
    expect(wrapper.attributes("aria-label")).toBe("Daniel Haas is collaborating live");
    expect(wrapper.attributes("style")).toContain("background-color: rgb(49, 90, 155)");
  });

  it("uses the same avatar frame for a future profile image", () => {
    const wrapper = mount(CollaboratorAvatar, {
      props: {
        collaborator: {
          ...collaborator,
          imageUrl: "/api/users/daniel/avatar",
        },
      },
    });

    expect(wrapper.get("img").attributes("src")).toBe("/api/users/daniel/avatar");
    expect(wrapper.text()).toBe("");
  });
});
