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
  RECURRENCE_UNITS,
  RecurrenceUnit,
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
  @IsOptional() @IsIn(RECURRENCE_UNITS) recurrenceUnit?: RecurrenceUnit | null;
}

type MembershipFieldNames =
  | 'membershipProcessStatus'
  | 'membershipStatusSignal'
  | 'godparents';

type RecurrenceFieldNames =
  | 'recurrenceFirstDueDate'
  | 'recurrenceInterval'
  | 'recurrenceUnit';

type CommonTopicDto = Omit<TopicDto, 'type' | MembershipFieldNames | RecurrenceFieldNames>;

export type DiscriminatedTopicDto = CommonTopicDto & (
  | {
      type: 'new_membership';
      membershipProcessStatus?: string | null;
      membershipStatusSignal?: MembershipStatusSignal | null;
      godparents?: string | null;
      recurrenceFirstDueDate?: null;
      recurrenceInterval?: null;
      recurrenceUnit?: null;
    }
  | {
      type: 'recurring';
      defaultSectionId: string;
      followUpDate?: null;
      recurrenceFirstDueDate: string;
      recurrenceInterval: number;
      recurrenceUnit: RecurrenceUnit;
      membershipProcessStatus?: null;
      membershipStatusSignal?: null;
      godparents?: null;
    }
  | {
      type: Exclude<TopicType, 'new_membership' | 'recurring'>;
      membershipProcessStatus?: null;
      membershipStatusSignal?: null;
      godparents?: null;
      recurrenceFirstDueDate?: null;
      recurrenceInterval?: null;
      recurrenceUnit?: null;
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
