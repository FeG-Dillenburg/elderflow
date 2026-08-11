import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";
import {
  ScalarAggregateType,
  TaskScalarFieldId,
  TopicScalarFieldId,
  UpdateScalarFieldId,
} from "./scalar-registry";

@Entity({ name: "e2ee_scalar_writes" })
export class E2eeScalarWrite {
  @PrimaryColumn({ name: "client_epoch_id", type: "uuid" })
  clientEpochId: string;

  @PrimaryColumn({ name: "record_id", type: "uuid" })
  recordId: string;

  @PrimaryColumn({ name: "field_id", type: "integer" })
  fieldId: TopicScalarFieldId | UpdateScalarFieldId | TaskScalarFieldId;

  @PrimaryColumn({ name: "write_counter", type: "bigint" })
  writeCounter: string;

  @Column({ name: "aggregate_type", type: "integer" })
  aggregateType: ScalarAggregateType;

  @Column({ name: "envelope_fingerprint", type: "bytea" })
  envelopeFingerprint: Buffer;

  @Column({ name: "commit_revision", type: "bigint" })
  commitRevision: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
