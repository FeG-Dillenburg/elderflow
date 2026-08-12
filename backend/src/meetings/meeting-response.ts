import { isE2eeKeyOperator } from "../e2ee/e2ee-role-policy";
import { User } from "../users/user.entity";
import { Meeting } from "./meeting.entity";

const account = (user?: User | null) => user
  ? {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      language: user.language,
    }
  : null;

export function meetingResponse(meeting: Meeting, viewer: User) {
  return {
    id: meeting.id,
    date: meeting.date,
    beginTime: meeting.beginTime,
    status: meeting.status,
    meetingLeaderId: meeting.meetingLeaderId,
    meetingLeader: account(meeting.meetingLeader),
    minuteTakerId: meeting.minuteTakerId,
    minuteTaker: account(meeting.minuteTaker),
    createdAt: meeting.createdAt,
    updatedAt: meeting.updatedAt,
    protected: isE2eeKeyOperator(viewer.role) && Buffer.isBuffer(meeting.titleEnvelope)
      ? {
          titleEnvelope: meeting.titleEnvelope.toString("base64url"),
          titleCommitRevision: meeting.titleCommitRevision,
        }
      : null,
  };
}
