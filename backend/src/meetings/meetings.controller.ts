import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import {
  MeetingDto,
  MeetingParticipantDto,
  MeetingTopicDto,
  ReorderMeetingTopicsDto,
  UpdateMeetingMinutesDto,
  UpdateMeetingTextDto,
  UpdateMeetingTopicDto,
} from './dto/meeting.dto';
import { MeetingAppearanceTexts, MeetingTopic } from './meeting-topic.entity';
import { MeetingUser } from './meeting-user.entity';
import { Meeting } from './meeting.entity';
import { MeetingDetail, MeetingsService } from './meetings.service';
import { Topic } from '../topics/topic.entity';
import { Permission } from '../auth/permissions';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';
import { UpdateTopicFieldsDto } from '../topics/dto/topic.dto';

@Controller('api/meetings')
@Permission('meetings')
export class MeetingsController {
  constructor(private readonly service: MeetingsService) {}
  @Get() findAll(): Promise<Meeting[]> { return this.service.findAll(); }
  @Post() create(@Body() input: MeetingDto): Promise<Meeting> { return this.service.create(input); }
  @Post(':id/complete') complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<Meeting> { return this.service.complete(id, user); }
  @Get(':id') findOne(@Param('id', ParseUUIDPipe) id: string): Promise<MeetingDetail> { return this.service.findOne(id); }
  @Put(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() input: MeetingDto): Promise<Meeting> { return this.service.update(id, input); }
  @Get(':id/suggestions') suggestions(@Param('id', ParseUUIDPipe) id: string): Promise<Topic[]> { return this.service.suggestions(id); }
  @Post(':id/participants') addParticipant(@Param('id', ParseUUIDPipe) id: string, @Body() input: MeetingParticipantDto): Promise<MeetingUser> { return this.service.addParticipant(id, input); }
  @Delete(':id/participants/:userId') removeParticipant(@Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string): Promise<void> { return this.service.removeParticipant(id, userId); }
  @Post(':id/topics') addTopic(@Param('id', ParseUUIDPipe) id: string, @Body() input: MeetingTopicDto): Promise<MeetingTopic> { return this.service.addTopic(id, input); }
  @Put(':id/topics/order') reorderTopics(@Param('id', ParseUUIDPipe) id: string, @Body() input: ReorderMeetingTopicsDto): Promise<MeetingTopic[]> { return this.service.reorderTopics(id, input.items); }
  @Put(':id/topics/:itemId') updateTopic(@Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() input: UpdateMeetingTopicDto): Promise<MeetingTopic> { return this.service.updateTopic(id, itemId, input); }
  @Put(':id/topics/:itemId/fields') updateTopicFields(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() input: UpdateTopicFieldsDto,
  ): Promise<Topic> { return this.service.updateTopicFields(id, itemId, input); }
  @Put(':id/topics/:itemId/preparation-context') updatePreparationContext(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() input: UpdateMeetingTextDto,
  ): Promise<MeetingAppearanceTexts> {
    return this.service.updatePreparationContext(id, itemId, input.text ?? null, input.version);
  }
  @Put(':id/topics/:itemId/person-note') updatePersonNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() input: UpdateMeetingTextDto,
  ): Promise<MeetingAppearanceTexts> {
    return this.service.updatePersonNote(id, itemId, input.text ?? null, input.version);
  }
  @Put(':id/topics/:itemId/minutes') updateMeetingMinutes(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() input: UpdateMeetingMinutesDto,
    @CurrentUser() user: User,
  ) {
    return this.service.updateMeetingMinutes(id, itemId, input, user);
  }
  @Delete(':id/topics/:itemId') removeTopic(@Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string): Promise<void> { return this.service.removeTopic(id, itemId); }
  @Post(':id/recurrences/:topicId/restore') restoreRecurrence(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('topicId', ParseUUIDPipe) topicId: string,
  ): Promise<void> { return this.service.restoreRecurrence(id, topicId); }
}
