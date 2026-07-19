import { HttpStatus } from '@nestjs/common';
import { codedHttpException } from '../errors/coded-http.exception';
import {
  MEMBERSHIP_STATUS_SIGNALS,
  Topic,
  TopicType,
} from './topic.entity';

type MembershipTopicState = Pick<
  Topic,
  'membershipProcessStatus' | 'membershipStatusSignal' | 'godparents'
>;

export const normalizedMembershipTopicState = (
  type: TopicType,
  input: Partial<MembershipTopicState>,
  converting = false,
  defaultSignal = false,
): Partial<MembershipTopicState> => {
  const fields: MembershipTopicState = {
    membershipProcessStatus: input.membershipProcessStatus ?? null,
    membershipStatusSignal: input.membershipStatusSignal ?? null,
    godparents: input.godparents ?? null,
  };
  if (type !== 'new_membership') {
    if (converting) {
      return {
        membershipProcessStatus: null,
        membershipStatusSignal: null,
        godparents: null,
      };
    }
    if (Object.values(fields).some((value) => value !== null)) {
      throw codedHttpException(
        HttpStatus.BAD_REQUEST,
        'MEMBERSHIP_FIELDS_PROHIBITED',
        'Membership fields are only allowed for New membership Topics',
      );
    }
    return {};
  }
  const signal = fields.membershipStatusSignal ?? (defaultSignal ? 'new' : null);
  if (!signal) {
    throw codedHttpException(
      HttpStatus.BAD_REQUEST,
      'MEMBERSHIP_SIGNAL_REQUIRED',
      'Membership status signal is required',
    );
  }
  if (!MEMBERSHIP_STATUS_SIGNALS.includes(signal)) {
    throw codedHttpException(
      HttpStatus.BAD_REQUEST,
      'MEMBERSHIP_SIGNAL_INVALID',
      'Membership status signal is invalid',
    );
  }
  return { ...fields, membershipStatusSignal: signal };
};
