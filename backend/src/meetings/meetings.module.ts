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

@Module({
  imports: [TypeOrmModule.forFeature([Meeting, MeetingUser, MeetingTopic, Topic, TopicUpdate, Task, AgendaSection])],
  controllers: [MeetingsController],
  providers: [MeetingsService],
  exports: [MeetingsService],
})
export class MeetingsModule {}
