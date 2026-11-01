import { describe, expect, it } from "vitest";
import { ProtectedTextBoundaryInterceptor } from "../../../backend/src/e2ee/protected-text-boundary.interceptor";
import { protectTopicPatch, type ScalarCryptor } from "./topic-scalars";

const cryptor: ScalarCryptor = {
  isUnlocked: () => true,
  encrypt: async () => new Uint8Array([1, 2, 3]),
  decrypt: async () => null,
};

describe("encrypted Topic writes at the HTTP boundary", () => {
  it.each([
    ["name", "nameCommitRevision"],
    ["description", "descriptionCommitRevision"],
    ["godparents", "godparentsCommitRevision"],
    ["membershipProcessStatus", "membershipProcessStatusCommitRevision"],
  ] as const)(
    "accepts an encrypted %s save with its draft revision",
    async (field, revisionProperty) => {
      const body = await protectTopicPatch("topic-id", {
        [field]: "Confidential draft",
        expectedRevisions: { [field]: "2" },
      }, cryptor);
      const context = {
        switchToHttp: () => ({ getRequest: () => ({ method: "PUT", path: "/api/topics/topic-id", body }) }),
      };
      const interceptor = new ProtectedTextBoundaryInterceptor();
      expect(() => interceptor.intercept(context as never, { handle: () => undefined } as never)).not.toThrow();
      expect(JSON.stringify(body)).not.toContain("Confidential draft");
      expect(body.expectedRevisions).toEqual({ [revisionProperty]: "2" });
    },
  );
});
