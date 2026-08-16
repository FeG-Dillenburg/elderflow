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
  return template.innerHTML;
}
