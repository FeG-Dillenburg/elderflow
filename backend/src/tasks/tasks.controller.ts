import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { TaskDto, TaskUpdateDto } from './dto/task.dto';
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

  @Get('references')
  @Header('Cache-Control', 'no-store')
  references(@CurrentUser() user: User) {
    return this.service.references(user);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  create(@Body() input: TaskDto, @CurrentUser() user: User): Promise<TaskResponse> {
    return this.service.create(input, user);
  }

  @Put(':id')
  @Header('Cache-Control', 'no-store')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: TaskUpdateDto,
    @CurrentUser() user: User,
  ): Promise<TaskResponse> {
    return this.service.update(id, input, user);
  }
}
