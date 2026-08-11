import { translate } from "../i18n";
import { base64UrlToBytes, bytesToBase64Url } from "./protocol";
import { MEETING_SCALAR_FIELDS, SCALAR_AGGREGATES } from "./scalar-registry";
import { scalarSession } from "./scalar-session";

export interface EncryptedMeetingTitle {
  protected: {
    titleEnvelope: string;
    titleCommitRevision: string;
  } | null;
}

export async function protectMeetingTitle(id: string, title: string | null): Promise<string> {
  return bytesToBase64Url(await scalarSession.encrypt({
    aggregateType: SCALAR_AGGREGATES.meeting,
    recordId: id,
    fieldId: MEETING_SCALAR_FIELDS.title.fieldId,
  }, title));
}

export async function unprotectMeetingTitle(
  id: string,
  value: EncryptedMeetingTitle["protected"],
): Promise<string | null> {
  if (!value) return translate("e2ee.unavailablePlaceholder");
  if (!scalarSession.isUnlocked()) return translate("e2ee.lockedPlaceholder");
  try {
    return await scalarSession.decrypt({
      aggregateType: SCALAR_AGGREGATES.meeting,
      recordId: id,
      fieldId: MEETING_SCALAR_FIELDS.title.fieldId,
    }, base64UrlToBytes(value.titleEnvelope));
  } catch {
    return translate("e2ee.unavailablePlaceholder");
  }
}
