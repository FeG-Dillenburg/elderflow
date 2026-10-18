import { auth } from "../auth/auth";
import { mentionUuid } from "../mentions/extraction";
import DOMPurify from "dompurify";

const ALLOWED_STYLE_PROPERTIES = new Set(["color", "background-color"]);

export function sanitizeRichText(html: string | null | undefined): string {
  const sanitized = DOMPurify.sanitize(html ?? "");
  const template = document.createElement("template");
  template.innerHTML = sanitized;
  for (const element of template.content.querySelectorAll<HTMLElement>("[style]")) {
    const properties = Array.from(
      { length: element.style.length },
      (_, index) => element.style.item(index),
    );
    for (const property of properties) {
      if (!ALLOWED_STYLE_PROPERTIES.has(property)) element.style.removeProperty(property);
    }
    if (!element.style.length) element.removeAttribute("style");
  }
  for (const element of template.content.querySelectorAll<HTMLElement>(".mention, .mention-own")) {
    element.classList.remove("mention", "mention-own");
  }
  for (const element of template.content.querySelectorAll<HTMLElement>('[data-type="mention"]')) {
    const id = element.dataset.id ?? "";
    element.removeAttribute("style");
    element.removeAttribute("data-is-mine");
    element.className = "";
    if (mentionUuid.test(id)) {
      element.className = id === auth.state.user?.id ? "mention mention-own" : "mention";
    } else {
      element.removeAttribute("data-type");
      element.removeAttribute("data-id");
    }
  }
  return template.innerHTML;
}


export function hasMeaningfulRichText(html: string | null | undefined): boolean {
  const template = document.createElement("template");
  template.innerHTML = sanitizeRichText(html);
  return Boolean(template.content.textContent?.replace(/[\s\u200B-\u200D\uFEFF]/g, ""));
}
