import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { MentionSnapshot } from "./mention-snapshot.entity";

// Workflow metadata stays separate from immutable Completed Meeting snapshots.
@Entity({ name: "mention_states" })
export class MentionState {
  @PrimaryColumn("uuid", { name: "mention_id" })
  mentionId: string;

  @ManyToOne(() => MentionSnapshot, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "mention_id" })
  mention?: MentionSnapshot;

  @Column({ type: "boolean", default: false })
  done: boolean;
}

// Keep successful operation identities even after reopening the mention.
@Entity({ name: "mention_comment_operations" })
export class MentionCommentOperation {
  @PrimaryColumn("uuid")
  id: string;

  @Column("uuid", { name: "mention_id" })
  mentionId: string;

  @ManyToOne(() => MentionSnapshot, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "mention_id" })
  mention?: MentionSnapshot;
}
