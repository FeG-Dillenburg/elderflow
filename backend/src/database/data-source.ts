import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { AgendaSection } from '../agenda-sections/agenda-section.entity';
import { Meeting } from '../meetings/meeting.entity';
import { MeetingTopic } from '../meetings/meeting-topic.entity';
import { MeetingUser } from '../meetings/meeting-user.entity';
import { Task } from '../tasks/task.entity';
import { Topic } from '../topics/topic.entity';
import { TopicUpdate } from '../topics/topic-update.entity';
import { migrations } from './migrations';
import { SkippedRecurrence } from '../recurrence/skipped-recurrence.entity';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run migrations');
}

export default new DataSource({
  type: 'postgres',
  url: databaseUrl,
  entities: [User, AgendaSection, Topic, TopicUpdate, Meeting, MeetingUser, MeetingTopic, Task, SkippedRecurrence],
  migrations,
  synchronize: false,
});
