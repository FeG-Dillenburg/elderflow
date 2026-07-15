import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { MeetingDto, MeetingParticipantDto, MeetingTopicDto, UpdateMeetingTopicDto } from './dto/meeting.dto';
import { MeetingTopic } from './meeting-topic.entity';
import { MeetingUser } from './meeting-user.entity';
import { Meeting } from './meeting.entity';
import { MeetingDetail, MeetingsService } from './meetings.service';
import { Topic } from '../topics/topic.entity';

@Controller('api/meetings')
export class MeetingsController {
  constructor(private readonly service: MeetingsService) {}
  @Get() findAll(): Promise<Meeting[]> { return this.service.findAll(); }
  @Post() create(@Body() input: MeetingDto): Promise<Meeting> { return this.service.create(input); }
  @Get(':id') findOne(@Param('id', ParseUUIDPipe) id: string): Promise<MeetingDetail> { return this.service.findOne(id); }
  @Put(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() input: MeetingDto): Promise<Meeting> { return this.service.update(id, input); }
  @Get(':id/suggestions') suggestions(@Param('id', ParseUUIDPipe) id: string): Promise<Topic[]> { return this.service.suggestions(id); }
  @Post(':id/participants') addParticipant(@Param('id', ParseUUIDPipe) id: string, @Body() input: MeetingParticipantDto): Promise<MeetingUser> { return this.service.addParticipant(id, input); }
  @Delete(':id/participants/:userId') removeParticipant(@Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string): Promise<void> { return this.service.removeParticipant(id, userId); }
  @Post(':id/topics') addTopic(@Param('id', ParseUUIDPipe) id: string, @Body() input: MeetingTopicDto): Promise<MeetingTopic> { return this.service.addTopic(id, input); }
  @Put(':id/topics/:itemId') updateTopic(@Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() input: UpdateMeetingTopicDto): Promise<MeetingTopic> { return this.service.updateTopic(id, itemId, input); }
  @Delete(':id/topics/:itemId') removeTopic(@Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string): Promise<void> { return this.service.removeTopic(id, itemId); }
}
