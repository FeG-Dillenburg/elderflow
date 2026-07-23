import DOMPurify from "dompurify";

export const sanitizeHistoryRichText = (html: string | null): string =>
  DOMPurify.sanitize(html ?? "").replace(/&nbsp;|&#160;|\u00a0/gi, " ");
