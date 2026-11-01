import { EntityManager } from "typeorm";
import { MentionSnapshot } from "./mention-snapshot.entity";
import { MentionState } from "./mention-state.entity";
import { MeetingTopic } from "./meeting-topic.entity";

export function currentMentionQuery(manager: EntityManager, user: { id: string }) {
  return manager.getRepository(MentionSnapshot).createQueryBuilder("mention")
    .leftJoinAndMapOne("mention.workflow", MentionState, "workflow", "workflow.mention_id = mention.id")
    .innerJoinAndSelect("mention.appearance", "appearance")
    .innerJoinAndSelect("appearance.meeting", "meeting")
    .innerJoinAndSelect("appearance.topic", "topic")
    .where("mention.user_id = :userId", { userId: user.id })
    .andWhere("meeting.status = 'completed'")
    .andWhere((query) => `NOT EXISTS ${query.subQuery()
      .select("1").from(MeetingTopic, "newer_appearance")
      .innerJoin("newer_appearance.meeting", "newer")
      .where("newer_appearance.topic_id = appearance.topic_id")
      .andWhere("newer.status = 'completed'")
      .andWhere("(newer.date, newer.begin_time, newer.id) > (meeting.date, meeting.begin_time, meeting.id)")
      .getQuery()}`)
    .orderBy("meeting.date", "DESC").addOrderBy("meeting.begin_time", "DESC")
    .addOrderBy("meeting.id", "DESC").addOrderBy("mention.occurrence", "ASC")
    .addOrderBy("mention.id", "ASC");
}
