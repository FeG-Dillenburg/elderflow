import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  registerDecorator,
  ValidationArguments,
} from 'class-validator';
import {
  MEMBERSHIP_STATUS_SIGNALS,
  MembershipStatusSignal,
  TOPIC_STATUSES,
  TopicType,
} from '../topic.entity';

const IsNewMembershipField = () =>
  (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isNewMembershipField',
      target: object.constructor,
      propertyName,
      validator: {
        validate: (_value: unknown, args: ValidationArguments) =>
          (args.object as TopicDto).type === 'new_membership',
        defaultMessage: () => 'Membership fields are only allowed for New membership Topics',
      },
    });
  };

export class TopicDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() description?: string | null;
  @IsString() type: TopicType;
  @IsIn(TOPIC_STATUSES) status: string;
  @IsOptional() @IsString() followUpDate?: string | null;
  @IsOptional() @IsUUID() responsibleUserId?: string | null;
  @IsOptional() @IsString() @IsNewMembershipField() membershipProcessStatus?: string | null;
  @IsOptional() @IsIn(MEMBERSHIP_STATUS_SIGNALS) @IsNewMembershipField()
  membershipStatusSignal?: MembershipStatusSignal | null;
  @IsOptional() @IsString() @IsNewMembershipField() godparents?: string | null;
  @IsOptional() @IsUUID() defaultSectionId?: string | null;
  @IsOptional() @IsInt() @Min(1) defaultPosition?: number | null;
  @IsOptional() @IsString() recurrenceFirstDueDate?: string | null;
  @IsOptional() @IsInt() @Min(1) recurrenceInterval?: number | null;
  @IsOptional() @IsIn(['weeks', 'months']) recurrenceUnit?: 'weeks' | 'months' | null;
}

type MembershipFieldNames =
  | 'membershipProcessStatus'
  | 'membershipStatusSignal'
  | 'godparents';

type CommonTopicDto = Omit<TopicDto, 'type' | MembershipFieldNames>;

export type DiscriminatedTopicDto = CommonTopicDto & (
  | {
      type: 'new_membership';
      membershipProcessStatus?: string | null;
      membershipStatusSignal?: MembershipStatusSignal | null;
      godparents?: string | null;
    }
  | {
      type: Exclude<TopicType, 'new_membership'>;
      membershipProcessStatus?: null;
      membershipStatusSignal?: null;
      godparents?: null;
    }
);

export class UpdateTopicFieldsDto {
  @IsOptional() @IsUUID() responsibleUserId?: string | null;
  @IsOptional() @IsString() membershipProcessStatus?: string | null;
  @IsOptional() @IsIn(MEMBERSHIP_STATUS_SIGNALS) membershipStatusSignal?: MembershipStatusSignal;
  @IsOptional() @IsString() godparents?: string | null;
}

export class TopicUpdateDto {
  @IsString() @IsNotEmpty() text: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsUUID() meetingId?: string | null;
}
