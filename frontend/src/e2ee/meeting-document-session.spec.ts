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

  it("continues the awareness clock when the same workspace is reloaded", async () => {
    await sodium.ready;
    const signing = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(3), "uint8array");
    const meetingId = "00000000-0000-4000-8000-000000000205";
    const clientEpochId = "00000000-0000-4000-8000-000000000206";
    session.unlock({
      organizationId: "00000000-0000-4000-8000-000000000207",
      ockId: "00000000-0000-4000-8000-000000000208",
      clientEpochId,
      noncePrefix: new Uint8Array(16).fill(2),
      contentKey: new Uint8Array(32).fill(4),
      signingPrivateKey: signing.privateKey,
    });
    const initial = await session.createInitial(meetingId);
    await session.encryptAwareness(meetingId, new Uint8Array([1]));

    await session.load(meetingId, {
      documentId: initial.documentId,
      activeSnapshotId: initial.snapshotId,
      currentServerSequence: "0",
      snapshot: {
        id: initial.snapshotId,
        clientEpochId,
        signingPublicKey: bytesToBase64Url(signing.publicKey),
        envelope: initial.snapshotEnvelope,
      },
      updates: [],
    });

    const second = decoder.decode(base64UrlToBytes(
      await session.encryptAwareness(meetingId, new Uint8Array([2])),
    )) as unknown[];
    expect((second[3] as unknown[])[5]).toBe(2);
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

  it("merges updates missed during a transient disconnect", async () => {
    await sodium.ready;
    const localSigning = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(1), "uint8array");
    const remoteSigning = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(2), "uint8array");
    const remote = new MeetingDocumentSession();
    const meetingId = "00000000-0000-4000-8000-000000000231";
    const localEpochId = "00000000-0000-4000-8000-000000000232";
    const remoteEpochId = "00000000-0000-4000-8000-000000000233";
    const common = {
      organizationId: "00000000-0000-4000-8000-000000000234",
      ockId: "00000000-0000-4000-8000-000000000235",
      contentKey: new Uint8Array(32).fill(3),
    };
    session.unlock({
      ...common,
      clientEpochId: localEpochId,
      noncePrefix: new Uint8Array(16).fill(4),
      signingPrivateKey: localSigning.privateKey,
    });
    const initial = await session.createInitial(meetingId);
    const emptyWorkspace = {
      documentId: initial.documentId,
      activeSnapshotId: initial.snapshotId,
      currentServerSequence: "0",
      snapshot: {
        id: initial.snapshotId,
        clientEpochId: localEpochId,
        coveredAuthorClocks: [] as Array<[string, string]>,
        signingPublicKey: bytesToBase64Url(localSigning.publicKey),
        envelope: initial.snapshotEnvelope,
      },
      updates: [],
    };
    remote.unlock({
      ...common,
      clientEpochId: remoteEpochId,
      noncePrefix: new Uint8Array(16).fill(5),
      signingPrivateKey: remoteSigning.privateKey,
    });
    await remote.load(meetingId, emptyWorkspace);
    const remoteUpdate = await remote.createFragmentUpdate(
      meetingId,
      "meeting/general-notes",
      "Remote edit",
    );
    await session.load(meetingId, emptyWorkspace);

    const result = await session.merge(meetingId, {
      ...emptyWorkspace,
      currentServerSequence: "1",
      updates: [{
        clientEpochId: remoteEpochId,
        authorClock: "1",
        signingPublicKey: bytesToBase64Url(remoteSigning.publicKey),
        envelope: remoteUpdate,
      }],
    }, "test-resync");

    expect(result).toEqual({ parentChanged: false });
    expect(session.hydrateFragments(meetingId, []).generalNotes).toBe("Remote edit");
    remote.lock();
  });

  it("omits orphan fragments from a compacted snapshot", async () => {
    await sodium.ready;
    const signing = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(8), "uint8array");
    const restored = new MeetingDocumentSession();
    const meetingId = "00000000-0000-4000-8000-000000000241";
    const clientEpochId = "00000000-0000-4000-8000-000000000242";
    const keys = {
      organizationId: "00000000-0000-4000-8000-000000000243",
      ockId: "00000000-0000-4000-8000-000000000244",
      clientEpochId,
      noncePrefix: new Uint8Array(16).fill(5),
      contentKey: new Uint8Array(32).fill(6),
      signingPrivateKey: signing.privateKey,
    };
    session.unlock(keys);
    const initial = await session.createInitial(meetingId);
    const retainedId = "00000000-0000-4000-8000-000000000245";
    const orphanId = "00000000-0000-4000-8000-000000000246";
    await session.createFragmentUpdate(
      meetingId,
      `appearance/${retainedId}/minutes`,
      "Retained",
    );
    await session.createFragmentUpdate(
      meetingId,
      `appearance/${orphanId}/minutes`,
      "Orphan",
    );

    const compacted = await session.createCompaction(meetingId, [
      "meeting/general-notes",
      "meeting/opening-input",
      `appearance/${retainedId}/minutes`,
    ]);
    restored.unlock(keys);
    await restored.load(meetingId, {
      documentId: initial.documentId,
      activeSnapshotId: compacted.snapshotId,
      currentServerSequence: "0",
      snapshot: {
        id: compacted.snapshotId,
        clientEpochId,
        snapshotClock: "2",
        coveredAuthorClocks: [],
        signingPublicKey: bytesToBase64Url(signing.publicKey),
        envelope: compacted.snapshotEnvelope,
      },
      updates: [],
    });

    const fragments = restored.hydrateFragments(meetingId, [
      { id: retainedId, person: false },
      { id: orphanId, person: false },
    ]).appearances;
    expect(fragments.get(retainedId)?.meetingMinutes).toBe("Retained");
    expect(fragments.get(orphanId)?.meetingMinutes).toBe("");
    restored.lock();
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
