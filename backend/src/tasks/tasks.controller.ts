import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { TaskDto, TaskUpdateDto } from './dto/task.dto';
import { Task } from './task.entity';
import { TasksService } from './tasks.service';
import { Permission } from '../auth/permissions';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';
import { TaskResponse } from './task-response';

@Controller('api/tasks')
@Permission('tasks')
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  findAll(
    @Query('status') status?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('topicId') topicId?: string,
    @Query('meetingId') meetingId?: string,
    @Query('overdue') overdue?: string,
    @Query('dueOn') dueOn?: string,
    @CurrentUser() user?: User,
  ): Promise<TaskResponse[]> {
    return this.service.findAll(
      { status, assignedToId, topicId, meetingId, overdue: overdue === 'true', dueOn },
      user!,
    );
  }

  @Post()
  create(@Body() input: TaskDto): Promise<Task> { return this.service.create(input); }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() input: TaskUpdateDto): Promise<Task> {
    return this.service.update(id, input);
  }
}
