import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Meeting } from '../meetings/meeting.entity';
import { Task } from '../tasks/task.entity';
import { Topic } from '../topics/topic.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([Meeting, Task, Topic])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
