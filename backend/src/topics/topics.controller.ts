import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';
import { DiscriminatedTopicDto, TopicDto, TopicUpdateDto } from './dto/topic.dto';
import { Topic } from './topic.entity';
import { TopicUpdate } from './topic-update.entity';
import { TopicsService } from './topics.service';
import { MeetingTopic } from '../meetings/meeting-topic.entity';
import { Permission } from '../auth/permissions';

@Controller('api/topics')
@Permission('topics')
export class TopicsController {
  constructor(private readonly service: TopicsService) {}

  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('responsibleUserId') responsibleUserId?: string,
    @Query('defaultSectionId') defaultSectionId?: string,
    @Query('dueOn') dueOn?: string,
  ): Promise<Topic[]> { return this.service.findAll({ status, type, responsibleUserId, defaultSectionId, dueOn }); }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Topic> { return this.service.findOne(id); }

  @Post()
  create(@Body() input: TopicDto): Promise<Topic> { return this.service.create(input as DiscriminatedTopicDto); }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() input: TopicDto): Promise<Topic> {
    return this.service.update(id, input as DiscriminatedTopicDto);
  }

  @Get(':id/updates')
  updates(@Param('id', ParseUUIDPipe) id: string): Promise<TopicUpdate[]> { return this.service.getUpdates(id); }

  @Post(':id/updates')
  addUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: TopicUpdateDto,
    @CurrentUser() user: User,
  ): Promise<TopicUpdate> { return this.service.addUpdate(id, input, user); }

  @Get(':id/appearances')
  appearances(@Param('id', ParseUUIDPipe) id: string): Promise<MeetingTopic[]> {
    return this.service.getAppearances(id);
  }
}
