import { createHash } from "node:crypto";

// UUID context binds each signed envelope to this completion and one occurrence.
export function mentionRecordId(barrierId: string, appearanceId: string, userId: string, occurrence: number): string {
  const bytes = createHash("sha1").update(Buffer.from(barrierId.replaceAll("-", ""), "hex")).update(JSON.stringify([appearanceId, userId, occurrence])).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 0x50;
  bytes[8] = (bytes[8] & 63) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
