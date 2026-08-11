import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgendaSection } from '../agenda-sections/agenda-section.entity';
import { Task } from '../tasks/task.entity';
import { Topic } from '../topics/topic.entity';
import { TopicUpdate } from '../topics/topic-update.entity';
import { MeetingTopic } from './meeting-topic.entity';
import { MeetingUser } from './meeting-user.entity';
import { Meeting } from './meeting.entity';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { MeetingSnapshotRegistry } from './meeting-snapshot-contributor';
import { NewMembershipSnapshotContributor } from '../topics/new-membership-snapshot.contributor';
import { RecurrenceModule } from '../recurrence/recurrence.module';
import { SkippedRecurrence } from '../recurrence/skipped-recurrence.entity';
import { E2eeModule } from '../e2ee/e2ee.module';
import { MeetingDocument } from './meeting-document.entity';
import { MeetingDocumentSnapshot } from './meeting-document-snapshot.entity';
import { MeetingDocumentUpdate } from './meeting-document-update.entity';
import { MeetingDocumentMutation } from './meeting-document-mutation.entity';
import { MeetingDocumentService } from './meeting-document.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Meeting,
      MeetingUser,
      MeetingTopic,
      MeetingDocument,
      MeetingDocumentSnapshot,
      MeetingDocumentUpdate,
      MeetingDocumentMutation,
      Topic,
      TopicUpdate,
      Task,
      AgendaSection,
      SkippedRecurrence,
    ]),
    RecurrenceModule,
    E2eeModule,
  ],
  controllers: [MeetingsController],
  providers: [
    MeetingSnapshotRegistry,
    MeetingDocumentService,
    NewMembershipSnapshotContributor,
    MeetingsService,
  ],
  exports: [MeetingSnapshotRegistry, MeetingsService],
})
export class MeetingsModule {}
