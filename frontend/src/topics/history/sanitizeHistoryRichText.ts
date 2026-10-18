import { sanitizeRichText } from "../../components/sanitize-rich-text";

export const sanitizeHistoryRichText = (html: string | null): string =>
  sanitizeRichText(html).replace(/&nbsp;|&#160;|\u00a0/gi, " ");
