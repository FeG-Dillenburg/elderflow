import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import sodium from "libsodium-wrappers-sumo";
import { getSchema } from "@tiptap/core";
import { prosemirrorJSONToYXmlFragment } from "@tiptap/y-tiptap";
import { meetingRichTextExtensions } from "../components/meeting-rich-text-extensions";
import vectorJson from "../../../docs/security/fixtures/meeting-document-vectors.json?raw";
import { bytesToBase64Url } from "./protocol";
import {
  applyEncryptedMeetingUpdate,
  applyEncryptedMeetingSnapshot,
  createEncryptedMeetingSnapshot,
  createEncryptedMeetingUpdate,
  meetingFragmentId,
  readMeetingFragment,
  replaceMeetingFragment,
} from "./meeting-document-codec";

const context = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  documentId: "00000000-0000-4000-8000-000000000002",
  activeSnapshotId: "00000000-0000-4000-8000-000000000003",
  ockId: "00000000-0000-4000-8000-000000000004",
  clientEpochId: "00000000-0000-4000-8000-000000000005",
  authorClock: 1,
  noncePrefix: Uint8Array.from({ length: 16 }, (_, index) => index + 1),
  contentKey: Uint8Array.from({ length: 32 }, (_, index) => index + 10),
};
const vectors = JSON.parse(vectorJson) as {
  updateEnvelope: string;
  updatePublicKey: string;
  snapshotEnvelope: string;
  snapshotPublicKey: string;
};

describe("Meeting document codec", () => {
  it("renders every supported collaborative rich-text mark after reload", () => {
    const document = new Y.Doc();
    const fragment = document.getXmlFragment("tiptap:meeting/general-notes");
    prosemirrorJSONToYXmlFragment(getSchema(meetingRichTextExtensions(true)), {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Styled", marks: [
          { type: "bold" }, { type: "italic" }, { type: "underline" },
          { type: "textStyle", attrs: { color: "#ff0000" } },
          { type: "highlight", attrs: { color: "#ffff00" } },
        ] }] },
        { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Quote" }] }] },
        { type: "orderedList", attrs: { start: 1, type: null }, content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }] }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Bullet", marks: [{ type: "link", attrs: { href: "https://example.com", target: "_blank", rel: "noopener noreferrer nofollow", class: null } }] }] }] }] },
      ],
    }, fragment);

    const html = readMeetingFragment(document, "meeting/general-notes");
    expect(html).toContain("<strong>");
    expect(html).toContain("<em>");
    expect(html).toContain("<u>Styled</u>");
    expect(html).toContain("color: rgb(255, 0, 0)");
    expect(html).toContain("background-color: rgb(255, 255, 0)");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<ul>");
    expect(html).toContain('href="https://example.com"');
  });

  it("uses stable semantic fragments and copy-forward creates an independent target", () => {
    const document = new Y.Doc();
    const source = meetingFragmentId("preparationContext", "appearance-source");
    const target = meetingFragmentId("preparationContext", "appearance-target");

    replaceMeetingFragment(document, source, "<p>Source context</p>");
    replaceMeetingFragment(document, target, readMeetingFragment(document, source));
    replaceMeetingFragment(document, source, "<p>Changed source</p>");

    expect(source).toBe("appearance/appearance-source/preparation-context");
    expect(readMeetingFragment(document, target)).toBe("<p>Source context</p>");
  });

  it("rejects a valid encrypted update transplanted to another document", async () => {
    await sodium.ready;
    const signing = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(7), "uint8array");
    const document = new Y.Doc();
    document.clientID = 51;
    const update = replaceMeetingFragment(document, "meeting/general-notes", "<p>Private notes</p>");
    const envelope = await createEncryptedMeetingUpdate({
      ...context,
      signingPrivateKey: signing.privateKey,
      update,
    });
    expect(bytesToBase64Url(envelope)).toBe(vectors.updateEnvelope);
    expect(bytesToBase64Url(signing.publicKey)).toBe(vectors.updatePublicKey);
    expect(await sha256(envelope)).toBe(
      "a5fc9ccf977512df910ecd632c6ea4a530223d51ceb6d91312367f18639faf52",
    );

    await expect(applyEncryptedMeetingUpdate(new Y.Doc(), {
      ...context,
      documentId: "00000000-0000-4000-8000-000000000099",
      signingPublicKey: signing.publicKey,
      envelope,
    })).rejects.toThrow("E2EE_MEETING_DOCUMENT_CONTEXT_INVALID");
  });

  it("reloads a full encrypted snapshot and fails closed on corruption", async () => {
    await sodium.ready;
    const signing = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(8), "uint8array");
    const source = new Y.Doc();
    source.clientID = 52;
    replaceMeetingFragment(source, "meeting/opening-input", "<p>Opening</p>");
    const snapshot = await createEncryptedMeetingSnapshot({
      ...context,
      snapshotId: context.activeSnapshotId,
      parentSnapshotId: "00000000-0000-0000-0000-000000000000",
      parentEnvelopeHash: new Uint8Array(32),
      coveredServerSequence: 0,
      coveredAuthorClocks: [],
      snapshotClock: 1,
      signingPrivateKey: signing.privateKey,
      document: source,
    });
    expect(bytesToBase64Url(snapshot)).toBe(vectors.snapshotEnvelope);
    expect(bytesToBase64Url(signing.publicKey)).toBe(vectors.snapshotPublicKey);
    expect(await sha256(snapshot)).toBe(
      "515004593eb89cfc88d37329129eb703f18d4932b7599244bdd557f9c77ac9e4",
    );
    const reloaded = new Y.Doc();
    await applyEncryptedMeetingSnapshot(reloaded, {
      ...context,
      snapshotId: context.activeSnapshotId,
      signingPublicKey: signing.publicKey,
      envelope: snapshot,
    });
    expect(readMeetingFragment(reloaded, "meeting/opening-input")).toBe("<p>Opening</p>");

    const corrupted = Uint8Array.from(snapshot);
    corrupted[corrupted.length - 70] ^= 1;
    await expect(applyEncryptedMeetingSnapshot(new Y.Doc(), {
      ...context,
      snapshotId: context.activeSnapshotId,
      signingPublicKey: signing.publicKey,
      envelope: corrupted,
    })).rejects.toThrow("E2EE_MEETING_DOCUMENT_INVALID");
  });
});

async function sha256(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(value).buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
