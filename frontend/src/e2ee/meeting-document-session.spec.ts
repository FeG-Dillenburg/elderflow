import { Decoder } from "cbor-x";
import sodium from "libsodium-wrappers-sumo";
import { afterEach, describe, expect, it } from "vitest";
import { MeetingDocumentSession } from "./meeting-document-session";
import { base64UrlToBytes, bytesToBase64Url } from "./protocol";

const decoder = new Decoder({ mapsAsObjects: false, useRecords: false });

describe("MeetingDocumentSession", () => {
  const session = new MeetingDocumentSession();

  afterEach(() => session.lock());

  it("continues the current client epoch clock after reloading its persisted updates", async () => {
    await sodium.ready;
    const signing = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(9), "uint8array");
    const meetingId = "00000000-0000-4000-8000-000000000201";
    const clientEpochId = "00000000-0000-4000-8000-000000000202";
    session.unlock({
      organizationId: "00000000-0000-4000-8000-000000000203",
      ockId: "00000000-0000-4000-8000-000000000204",
      clientEpochId,
      noncePrefix: new Uint8Array(16).fill(5),
      contentKey: new Uint8Array(32).fill(6),
      signingPrivateKey: signing.privateKey,
    });
    const initial = await session.createInitial(meetingId);
    const firstUpdate = await session.createFragmentUpdate(
      meetingId,
      "meeting/general-notes",
      "First",
    );
    await session.load(meetingId, {
      documentId: initial.documentId,
      activeSnapshotId: initial.snapshotId,
      currentServerSequence: "1",
      snapshot: {
        id: initial.snapshotId,
        clientEpochId,
        signingPublicKey: bytesToBase64Url(signing.publicKey),
        envelope: initial.snapshotEnvelope,
      },
      updates: [{
        clientEpochId,
        authorClock: "1",
        signingPublicKey: bytesToBase64Url(signing.publicKey),
        envelope: firstUpdate,
      }],
    });

    const secondUpdate = await session.createFragmentUpdate(
      meetingId,
      "meeting/general-notes",
      "Second",
    );
    const decoded = decoder.decode(base64UrlToBytes(secondUpdate)) as unknown[];
    expect((decoded[3] as unknown[])[6]).toBe(2);
  });

  it("creates an update when initializing a new appearance fragment with empty text", async () => {
    await sodium.ready;
    const signing = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(9), "uint8array");
    const meetingId = "00000000-0000-4000-8000-000000000211";
    const clientEpochId = "00000000-0000-4000-8000-000000000214";
    session.unlock({
      organizationId: "00000000-0000-4000-8000-000000000212",
      ockId: "00000000-0000-4000-8000-000000000213",
      clientEpochId,
      noncePrefix: new Uint8Array(16).fill(5),
      contentKey: new Uint8Array(32).fill(6),
      signingPrivateKey: signing.privateKey,
    });
    const initial = await session.createInitial(meetingId);

    const update = await session.createFragmentUpdate(
      meetingId,
      "appearance/00000000-0000-4000-8000-000000000215/preparation-context",
      "",
    );

    await session.load(meetingId, {
      documentId: initial.documentId,
      activeSnapshotId: initial.snapshotId,
      currentServerSequence: "1",
      snapshot: {
        id: initial.snapshotId,
        clientEpochId,
        signingPublicKey: bytesToBase64Url(signing.publicKey),
        envelope: initial.snapshotEnvelope,
      },
      updates: [{
        clientEpochId,
        authorClock: "1",
        signingPublicKey: bytesToBase64Url(signing.publicKey),
        envelope: update,
      }],
    });

    expect(session.hydrateFragments(meetingId, [{
      id: "00000000-0000-4000-8000-000000000215",
      person: false,
    }]).appearances.get("00000000-0000-4000-8000-000000000215")?.preparationContext)
      .toBe("");
  });

  it("restores saved general and opening notes after reconstructing the workspace", async () => {
    await sodium.ready;
    const signing = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(7), "uint8array");
    const meetingId = "00000000-0000-4000-8000-000000000221";
    const clientEpochId = "00000000-0000-4000-8000-000000000222";
    session.unlock({
      organizationId: "00000000-0000-4000-8000-000000000223",
      ockId: "00000000-0000-4000-8000-000000000224",
      clientEpochId,
      noncePrefix: new Uint8Array(16).fill(4),
      contentKey: new Uint8Array(32).fill(3),
      signingPrivateKey: signing.privateKey,
    });
    const initial = await session.createInitial(meetingId);
    const generalNotes = await session.createFragmentUpdate(
      meetingId,
      "meeting/general-notes",
      "<p>General note</p>",
    );
    const openingInput = await session.createFragmentUpdate(
      meetingId,
      "meeting/opening-input",
      "<p>Opening note</p>",
    );

    await session.load(meetingId, {
      documentId: initial.documentId,
      activeSnapshotId: initial.snapshotId,
      currentServerSequence: "2",
      snapshot: {
        id: initial.snapshotId,
        clientEpochId,
        signingPublicKey: bytesToBase64Url(signing.publicKey),
        envelope: initial.snapshotEnvelope,
      },
      updates: [generalNotes, openingInput].map((envelope, index) => ({
        clientEpochId,
        authorClock: String(index + 1),
        signingPublicKey: bytesToBase64Url(signing.publicKey),
        envelope,
      })),
    });

    expect(session.hydrateFragments(meetingId, [])).toMatchObject({
      generalNotes: "<p>General note</p>",
      openingInput: "<p>Opening note</p>",
    });
  });

  it("refuses document mutation while locked and discards unusable local state", async () => {
    await expect(session.createFragmentUpdate(
      "00000000-0000-4000-8000-000000000201",
      "meeting/general-notes",
      "Refused",
    )).rejects.toThrow("E2EE_PROTECTED_TEXT_LOCKED");

    session.discard("00000000-0000-4000-8000-000000000201");
    expect(() => session.hydrateFragments(
      "00000000-0000-4000-8000-000000000201",
      [],
    )).toThrow("MEETING_WORKSPACE_UNAVAILABLE");
  });
});
