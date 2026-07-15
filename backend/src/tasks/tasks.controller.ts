import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { TaskDto } from './dto/task.dto';
import { Task } from './task.entity';
import { TasksService } from './tasks.service';

@Controller('api/tasks')
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('topicId') topicId?: string,
    @Query('meetingId') meetingId?: string,
    @Query('overdue') overdue?: string,
    @Query('dueOn') dueOn?: string,
  ): Promise<Task[]> {
    return this.service.findAll({ status, assignedToId, topicId, meetingId, overdue: overdue === 'true', dueOn });
  }

  @Post()
  create(@Body() input: TaskDto): Promise<Task> { return this.service.create(input); }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() input: TaskDto): Promise<Task> {
    return this.service.update(id, input);
  }
}
