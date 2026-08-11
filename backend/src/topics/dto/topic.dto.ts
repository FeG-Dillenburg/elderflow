import {
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  registerDecorator,
  ValidateNested,
  ValidationArguments,
} from 'class-validator';
import { Type } from 'class-transformer';
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

export class TopicEncryptedScalarsDto {
  @IsString() @IsNotEmpty() nameEnvelope: string;
  @IsString() @IsNotEmpty() descriptionEnvelope: string;
  @IsString() @IsNotEmpty() membershipProcessStatusEnvelope: string;
  @IsString() @IsNotEmpty() godparentsEnvelope: string;
}

export class TopicEncryptedScalarPatchDto {
  @IsOptional() @IsString() @IsNotEmpty() nameEnvelope?: string;
  @IsOptional() @IsString() @IsNotEmpty() descriptionEnvelope?: string;
  @IsOptional() @IsString() @IsNotEmpty() membershipProcessStatusEnvelope?: string;
  @IsOptional() @IsString() @IsNotEmpty() godparentsEnvelope?: string;
}

export class TopicDto {
  @IsUUID() id: string;
  @IsDefined() @ValidateNested() @Type(() => TopicEncryptedScalarsDto)
  protected: TopicEncryptedScalarsDto;
  @IsString() type: TopicType;
  @IsIn(TOPIC_STATUSES) status: string;
  @IsOptional() @IsString() followUpDate?: string | null;
  @IsOptional() @IsUUID() responsibleUserId?: string | null;
  @IsOptional() @IsIn(MEMBERSHIP_STATUS_SIGNALS) @IsNewMembershipField()
  membershipStatusSignal?: MembershipStatusSignal | null;
  @IsOptional() @IsUUID() defaultSectionId?: string | null;
  @IsOptional() @IsInt() @Min(1) defaultPosition?: number | null;
  @IsOptional() @IsString() recurrenceFirstDueDate?: string | null;
  @IsOptional() @IsInt() @Min(1) recurrenceInterval?: number | null;
  @IsOptional() @IsIn(RECURRENCE_UNITS) recurrenceUnit?: RecurrenceUnit | null;
}

export class TopicPatchDto {
  @IsOptional() @ValidateNested() @Type(() => TopicEncryptedScalarPatchDto)
  protected?: TopicEncryptedScalarPatchDto;
  @IsOptional() @IsString() type?: TopicType;
  @IsOptional() @IsIn(TOPIC_STATUSES) status?: string;
  @IsOptional() @IsString() followUpDate?: string | null;
  @IsOptional() @IsUUID() responsibleUserId?: string | null;
  @IsOptional() @IsIn(MEMBERSHIP_STATUS_SIGNALS) membershipStatusSignal?: MembershipStatusSignal | null;
  @IsOptional() @IsUUID() defaultSectionId?: string | null;
  @IsOptional() @IsInt() @Min(1) defaultPosition?: number | null;
  @IsOptional() @IsString() recurrenceFirstDueDate?: string | null;
  @IsOptional() @IsInt() @Min(1) recurrenceInterval?: number | null;
  @IsOptional() @IsIn(RECURRENCE_UNITS) recurrenceUnit?: RecurrenceUnit | null;
}

type MembershipFieldNames = 'membershipStatusSignal';

type RecurrenceFieldNames =
  | 'recurrenceFirstDueDate'
  | 'recurrenceInterval'
  | 'recurrenceUnit';

type CommonTopicDto = Omit<TopicDto, 'type' | MembershipFieldNames | RecurrenceFieldNames>;

export type DiscriminatedTopicDto = CommonTopicDto & (
  | {
      type: 'new_membership';
      membershipStatusSignal?: MembershipStatusSignal | null;
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
      membershipStatusSignal?: null;
    }
  | {
      type: Exclude<TopicType, 'new_membership' | 'recurring'>;
      membershipStatusSignal?: null;
      recurrenceFirstDueDate?: null;
      recurrenceInterval?: null;
      recurrenceUnit?: null;
    }
);

export class UpdateTopicFieldsDto {
  @IsOptional() @IsUUID() responsibleUserId?: string | null;
  @IsOptional() @IsIn(MEMBERSHIP_STATUS_SIGNALS) membershipStatusSignal?: MembershipStatusSignal;
}

export class TopicUpdateDto {
  @IsUUID() id: string;
  @IsString() @IsNotEmpty() textEnvelope: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsUUID() meetingId?: string | null;
}
