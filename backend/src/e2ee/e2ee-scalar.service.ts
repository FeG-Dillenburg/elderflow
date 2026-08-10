import { HttpStatus, Injectable } from "@nestjs/common";
import sodium from "libsodium-wrappers-sumo";
import { EntityManager } from "typeorm";
import { codedHttpException } from "../errors/coded-http.exception";
import { User } from "../users/user.entity";
import { E2eeClientEpoch } from "./e2ee-client-epoch.entity";
import { E2eeKeyState } from "./e2ee-key-state.entity";
import { isE2eeKeyOperator } from "./e2ee-role-policy";
import { E2eeScalarWrite } from "./e2ee-scalar-write.entity";
import { ScalarFieldContext } from "./scalar-registry";
import {
  scalarEnvelopeClientEpochId,
  validateScalarEnvelope,
} from "./scalar-envelope-validator";

export interface ValidatedScalarWrite {
  envelope: Buffer;
  commitRevision: string;
  duplicate: boolean;
}

@Injectable()
export class E2eeScalarService {
  assertContentUser(user: User): void {
    if (!isE2eeKeyOperator(user.role)) {
      throw codedHttpException(
        HttpStatus.FORBIDDEN,
        "E2EE_PROTECTED_CIPHERTEXT_FORBIDDEN",
        "This role cannot access Protected ciphertext",
      );
    }
  }

  async validateWrite(
    manager: EntityManager,
    user: User,
    context: ScalarFieldContext,
    encodedEnvelope: string,
    currentRevision: string | null,
  ): Promise<ValidatedScalarWrite> {
    this.assertContentUser(user);
    const envelope = this.decodeEnvelope(encodedEnvelope);
    const clientEpochId = scalarEnvelopeClientEpochId(envelope);
    const [state, epoch] = await Promise.all([
      manager.findOne(E2eeKeyState, { where: { id: 1 } }),
      manager.findOne(E2eeClientEpoch, { where: { id: clientEpochId } }),
    ]);
    if (!state) {
      throw codedHttpException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "E2EE_NOT_CONFIGURED",
        "Protected text is not configured",
      );
    }
    if (!epoch || epoch.revokedAt || epoch.userId !== user.id) {
      throw codedHttpException(
        HttpStatus.CONFLICT,
        "E2EE_CLIENT_EPOCH_INVALID",
        "Client epoch is not active for this user",
      );
    }
    await sodium.ready;
    const metadata = validateScalarEnvelope(envelope, {
      ...context,
      organizationId: state.organizationId,
      ockId: state.ockId,
      clientEpochId,
      noncePrefix: epoch.noncePrefix,
      signingPublicKey: epoch.signingPublicKey,
    });
    const existing = await manager.findOne(E2eeScalarWrite, {
      where: {
        clientEpochId,
        recordId: context.recordId,
        fieldId: context.fieldId,
        writeCounter: String(metadata.writeCounter),
      },
    });
    if (existing) {
      if (!existing.envelopeFingerprint.equals(metadata.fingerprint)) {
        throw codedHttpException(
          HttpStatus.CONFLICT,
          "E2EE_COUNTER_REUSE",
          "Encrypted scalar counter was reused with different bytes",
        );
      }
      return {
        envelope,
        commitRevision: existing.commitRevision,
        duplicate: true,
      };
    }

    const commitRevision = String(BigInt(currentRevision ?? "0") + 1n);
    await manager.save(E2eeScalarWrite, manager.create(E2eeScalarWrite, {
      clientEpochId,
      recordId: context.recordId,
      fieldId: context.fieldId,
      writeCounter: String(metadata.writeCounter),
      aggregateType: context.aggregateType,
      envelopeFingerprint: metadata.fingerprint,
      commitRevision,
    }));
    return { envelope, commitRevision, duplicate: false };
  }

  encodeEnvelope(envelope: Buffer): string {
    return envelope.toString("base64url");
  }

  private decodeEnvelope(value: string): Buffer {
    if (typeof value !== "string") this.invalidEnvelope();
    const decoded = Buffer.from(value, "base64url");
    if (decoded.length < 256 || decoded.length > 1_050_000 || decoded.toString("base64url") !== value) {
      this.invalidEnvelope();
    }
    return decoded;
  }

  private invalidEnvelope(): never {
    throw codedHttpException(
      HttpStatus.BAD_REQUEST,
      "E2EE_ENVELOPE_INVALID",
      "Invalid encrypted scalar envelope",
    );
  }
}
