import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Topic } from './topic.entity';
import { TopicUpdate } from './topic-update.entity';
import { TopicsController } from './topics.controller';
import { TopicsService } from './topics.service';
import { MeetingTopic } from '../meetings/meeting-topic.entity';
import { RecurrenceModule } from '../recurrence/recurrence.module';
import { E2eeModule } from '../e2ee/e2ee.module';
import { SkippedRecurrence } from '../recurrence/skipped-recurrence.entity';
import { TopicHistoryService } from './topic-history.service';

@Module({
  imports: [TypeOrmModule.forFeature([Topic, TopicUpdate, MeetingTopic, SkippedRecurrence]), RecurrenceModule, E2eeModule],
  controllers: [TopicsController],
  providers: [TopicsService, TopicHistoryService],
  exports: [TopicsService],
})
export class TopicsModule {}
