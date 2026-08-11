import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';
import { DiscriminatedTopicDto, TopicDto, TopicPatchDto, TopicUpdateDto } from './dto/topic.dto';
import { TopicsService } from './topics.service';
import { Permission } from '../auth/permissions';
import { SkippedRecurrence } from '../recurrence/skipped-recurrence.entity';
import { TopicHistoryService } from './topic-history.service';
import { TopicHistoryEntry } from './topic-history';

@Controller('api/topics')
@Permission('topics')
export class TopicsController {
  constructor(
    private readonly service: TopicsService,
    private readonly history: TopicHistoryService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  findAll(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('responsibleUserId') responsibleUserId?: string,
    @Query('defaultSectionId') defaultSectionId?: string,
    @Query('dueOn') dueOn?: string,
    @CurrentUser() user?: User,
  ) { return this.service.findAll({ status, type, responsibleUserId, defaultSectionId, dueOn }, user!); }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) { return this.service.findOne(id, user); }

  @Post()
  @Header('Cache-Control', 'no-store')
  create(@Body() input: TopicDto, @CurrentUser() user: User) { return this.service.create(input as DiscriminatedTopicDto, user); }

  @Put(':id')
  @Header('Cache-Control', 'no-store')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() input: TopicPatchDto, @CurrentUser() user: User) {
    return this.service.update(id, input as Partial<DiscriminatedTopicDto>, user);
  }

  @Get(':id/updates')
  @Header('Cache-Control', 'no-store')
  updates(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) { return this.service.getUpdates(id, user); }

  @Post(':id/updates')
  @Header('Cache-Control', 'no-store')
  addUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: TopicUpdateDto,
    @CurrentUser() user: User,
  ) { return this.service.addUpdate(id, input, user); }

  @Get(':id/history')
  @Header('Cache-Control', 'no-store')
  topicHistory(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User): Promise<TopicHistoryEntry[]> {
    return this.history.getHistory(id, user);
  }

  @Get(':id/appearances')
  appearances(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getAppearances(id);
  }

  @Get(':id/skipped-recurrences')
  skippedRecurrences(@Param('id', ParseUUIDPipe) id: string): Promise<SkippedRecurrence[]> {
    return this.service.getSkippedRecurrences(id);
  }
}
