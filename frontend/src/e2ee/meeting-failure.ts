/** Classification contains stable protocol codes only, never confidential error details. */
export const classifyMeetingFailure = (error: unknown): "recoverable" | "access" | "integrity" => {
  const failure = error as { code?: string; message?: string; status?: number } | null;
  const code = failure?.code ?? failure?.message ?? "";
  if (failure?.status === 401 || failure?.status === 403 || [
    "AUTH_SESSION_REVOKED", "AUTH_USER_NOT_FOUND", "AUTH_REQUIRED", "AUTH_FORBIDDEN",
    "MEETING_COMPLETED_IMMUTABLE", "E2EE_CLIENT_EPOCH_INVALID", "E2EE_PROTECTED_CIPHERTEXT_FORBIDDEN",
  ].includes(code)) return "access";
  if (error instanceof TypeError || (failure?.status ?? 0) >= 500
    || failure?.status === 408 || failure?.status === 429 || [
      "E2EE_SNAPSHOT_PARENT_INVALID", "E2EE_COMPACTION_IN_PROGRESS",
      "E2EE_COMPACTION_BARRIER_INVALID", "E2EE_COMPACTION_NOT_REQUIRED",
    ].includes(code)) return "recoverable";
  return "integrity";
};
