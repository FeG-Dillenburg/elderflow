import { E2eeKeyState } from "../e2ee/e2ee-key-state.entity";
import { E2eeClientEpoch } from "../e2ee/e2ee-client-epoch.entity";
import { scalarEnvelopeClientEpochId } from "../e2ee/scalar-envelope-validator";
import { HttpStatus, Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { permissionsByRole } from "../auth/permissions";
import { isE2eeKeyOperator } from "../e2ee/e2ee-role-policy";
import { codedHttpException } from "../errors/coded-http.exception";
import { TopicUpdateDto } from "../topics/dto/topic.dto";
import { TopicUpdate } from "../topics/topic-update.entity";
import { Topic } from "../topics/topic.entity";
import { TopicsService } from "../topics/topics.service";
import { User } from "../users/user.entity";
import { currentMentionQuery } from "./current-mention-query";
import { MentionSnapshot } from "./mention-snapshot.entity";
import { MentionCommentOperation, MentionState } from "./mention-state.entity";

@Injectable()
export class MentionWorkflowService {
  constructor(
    private readonly database: DataSource,
    private readonly topics: TopicsService,
  ) {}

  async setState(id: string, done: boolean, user: User, comment?: TopicUpdateDto) {
    return this.database.transaction(async (manager) => {
      const snapshot = await manager.findOne(MentionSnapshot, {
        where: { id, userId: user.id }, relations: { appearance: true },
      });
      if (!snapshot) {
        throw codedHttpException(HttpStatus.NOT_FOUND, "MENTION_NOT_FOUND", "Mention not found");
      }
      const topicId = snapshot.appearance!.topicId;
      // Completion locks its Meeting then Topics in UUID order. Workflow writes lock
      // the Topic first, serializing currentness and competing state/comment writes.
      await manager.findOne(Topic, { where: { id: topicId }, lock: { mode: "pessimistic_write" } });
      const actor = await manager.findOne(User, { where: { id: user.id }, lock: { mode: "pessimistic_read" } });
      if (!actor || actor.archivedAt || actor.sessionVersion !== user.sessionVersion) {
        throw codedHttpException(HttpStatus.FORBIDDEN, "AUTH_FORBIDDEN", "Mention access changed");
      }
      if (!isE2eeKeyOperator(actor.role)) {
        throw codedHttpException(HttpStatus.FORBIDDEN, "AUTH_FORBIDDEN", "Content access required");
      }
      const permission = permissionsByRole[actor.role];
      if (permission.meetings === "hide" || permission.topics === "hide"
        || (comment && permission.topics !== "manage")) {
        throw codedHttpException(HttpStatus.FORBIDDEN, "AUTH_FORBIDDEN", "Mention action is not permitted");
      }
      const current = await currentMentionQuery(manager, actor).andWhere("mention.id = :id", { id }).getOne();
      if (!current) {
        throw codedHttpException(HttpStatus.CONFLICT, "MENTION_STALE", "A later Meeting replaced this mention");
      }
      const state = await manager.findOneBy(MentionState, { mentionId: id });
      if (comment) {
        const receipt = await manager.findOneBy(MentionCommentOperation, { id: comment.id });
        if (receipt && receipt.mentionId !== id) {
          throw codedHttpException(HttpStatus.CONFLICT, "MENTION_ALREADY_DONE", "Operation belongs to another mention");
        }
        if (!receipt && state?.done) {
          throw codedHttpException(HttpStatus.CONFLICT, "MENTION_ALREADY_DONE", "Mention was already resolved");
        }
        // A UUID used for an ordinary Update cannot be repurposed as a new resolve operation.
        if (!receipt && await manager.existsBy(TopicUpdate, { id: comment.id })) {
          throw codedHttpException(HttpStatus.CONFLICT, "TOPIC_UPDATE_RETRY_MISMATCH", "Update identifier is already used");
        }
        // Hold the active key generation and author epoch through commit so
        // revocation/rotation cannot race the encrypted Update write.
        await manager.findOne(E2eeKeyState, { where: { id: 1 }, lock: { mode: "pessimistic_read" } });
        const epochId = scalarEnvelopeClientEpochId(Buffer.from(comment.textEnvelope, "base64url"));
        await manager.findOne(E2eeClientEpoch, { where: { id: epochId }, lock: { mode: "pessimistic_read" } });
        await this.topics.addUpdateInTransaction(manager, topicId, { ...comment, type: "update" }, actor);
        if (receipt) return { id, done: state?.done ?? false };
        await manager.insert(MentionCommentOperation, { id: comment.id, mentionId: id });
      }
      await manager.upsert(MentionState, { mentionId: id, done }, ["mentionId"]);
      return { id, done };
    });
  }
}
