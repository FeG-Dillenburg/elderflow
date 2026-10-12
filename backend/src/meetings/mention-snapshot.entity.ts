import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique } from "typeorm";
import { MeetingTopic } from "./meeting-topic.entity";
import { User } from "../users/user.entity";

@Entity({ name: "mention_snapshots" })
@Unique(["appearanceId", "userId", "occurrence"])
export class MentionSnapshot {
  @PrimaryColumn("uuid")
  id: string;

  @Column({ name: "appearance_id", type: "uuid" })
  appearanceId: string;

  @ManyToOne(() => MeetingTopic, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "appearance_id" })
  appearance?: MeetingTopic;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "user_id" })
  user?: User;

  @Column({ type: "integer" })
  occurrence: number;

  @Column({ name: "context_envelope", type: "bytea" })
  contextEnvelope: Buffer;
}
