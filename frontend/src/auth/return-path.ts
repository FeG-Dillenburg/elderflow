export function safeReturnPath(value: unknown): string {
  if (
    typeof value !== "string"
    || !value.startsWith("/")
    || value.startsWith("//")
    || value.includes("\\")
  ) {
    return "/";
  }
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || decoded.includes("\\")) {
      return "/";
    }
    const parsed = new URL(value, "https://elderflow.invalid");
    return parsed.origin === "https://elderflow.invalid"
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : "/";
  } catch {
    return "/";
  }
}
