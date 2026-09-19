import sodium from "libsodium-wrappers-sumo";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meetingDocumentSession } from "../../e2ee/meeting-document-session";
import { updateMeetingText } from "./infrastructure";

describe("Meeting workspace infrastructure", () => {
  afterEach(() => {
    meetingDocumentSession.lock();
    vi.unstubAllGlobals();
  });

  it("encrypts an offline domain-target edit with the real Meeting document session", async () => {
    await sodium.ready;
    const signing = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(7), "uint8array");
    const meetingId = "00000000-0000-4000-8000-000000000301";
    meetingDocumentSession.unlock({
      organizationId: "00000000-0000-4000-8000-000000000302",
      ockId: "00000000-0000-4000-8000-000000000303",
      clientEpochId: "00000000-0000-4000-8000-000000000304",
      noncePrefix: new Uint8Array(16).fill(8),
      contentKey: new Uint8Array(32).fill(9),
      signingPrivateKey: signing.privateKey,
    });
    await meetingDocumentSession.createInitial(meetingId);
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "accepted" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetch);

    await updateMeetingText(meetingId, { kind: "general_notes" }, "Encrypted note");

    expect(meetingDocumentSession.hydrateFragments(meetingId, []).generalNotes)
      .toBe("Encrypted note");
    expect(fetch).toHaveBeenCalledWith(
      `/api/meetings/${meetingId}/workspace/updates`,
      expect.objectContaining({
        method: "POST",
        body: expect.any(Uint8Array),
      }),
    );
  });
});
