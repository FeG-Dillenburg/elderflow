import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Header,
  Headers,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { Permission } from "../auth/permissions";
import { UpdateTopicFieldsDto } from "../topics/dto/topic.dto";
import { User } from "../users/user.entity";
import {
  MeetingDocumentUpdateDto,
  MeetingDto,
  MeetingParticipantDto,
  MeetingTopicDto,
  MeetingUpdateDto,
  ReorderMeetingTopicsDto,
  UpdateMeetingTopicDto,
} from "./dto/meeting.dto";
import { MeetingsService } from "./meetings.service";
import { MeetingCreateBinaryPipe, MeetingTopicBinaryPipe, MeetingUpdateBinaryPipe } from "./meeting-binary.pipe";

@Controller("api/meetings")
@Permission("meetings")
export class MeetingsController {
  constructor(private readonly service: MeetingsService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  findAll(@CurrentUser() user: User) { return this.service.findAll(user); }

  @Post()
  @Header("Cache-Control", "no-store")
  create(@Body(new MeetingCreateBinaryPipe()) input: unknown, @CurrentUser() user: User) {
    return this.service.create(input as MeetingDto, user);
  }

  @Post(":id/complete")
  @Header("Cache-Control", "no-store")
  complete(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.service.complete(id, user);
  }

  @Get(":id")
  @Header("Cache-Control", "no-store")
  findOne(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.service.findOne(id, user);
  }

  @Put(":id")
  @Header("Cache-Control", "no-store")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: MeetingUpdateDto,
    @CurrentUser() user: User,
  ) { return this.service.update(id, input, user); }

  @Post(":id/workspace/updates")
  @Header("Cache-Control", "no-store")
  appendWorkspaceUpdate(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new MeetingUpdateBinaryPipe()) input: unknown,
    @CurrentUser() user: User,
    @Headers("x-elderflow-appearance-id") appearanceId?: string,
  ) {
    if (appearanceId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(appearanceId)) {
      throw new BadRequestException({
        code: "E2EE_BINARY_BODY_INVALID",
        message: "Invalid appearance identifier",
      });
    }
    return this.service.appendWorkspaceUpdate(
      id,
      (input as MeetingDocumentUpdateDto).envelope,
      user,
      appearanceId,
    );
  }

  @Get(":id/workspace")
  @Header("Cache-Control", "no-store")
  workspace(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) { return this.service.workspace(id, user); }

  @Get(":id/suggestions")
  @Header("Cache-Control", "no-store")
  suggestions(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("future", new DefaultValuePipe(false), ParseBoolPipe) future: boolean,
  ) { return this.service.suggestions(id, future, user); }

  @Post(":id/participants")
  addParticipant(@Param("id", ParseUUIDPipe) id: string, @Body() input: MeetingParticipantDto) {
    return this.service.addParticipant(id, input);
  }

  @Delete(":id/participants/:userId")
  removeParticipant(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
  ) { return this.service.removeParticipant(id, userId); }

  @Post(":id/topics")
  @Header("Cache-Control", "no-store")
  addTopic(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new MeetingTopicBinaryPipe()) input: unknown,
    @CurrentUser() user: User,
  ) { return this.service.addTopic(id, input as MeetingTopicDto, user); }

  @Put(":id/topics/order")
  reorderTopics(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: ReorderMeetingTopicsDto,
  ) { return this.service.reorderTopics(id, input.items); }

  @Put(":id/topics/:itemId")
  updateTopic(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body() input: UpdateMeetingTopicDto,
  ) { return this.service.updateTopic(id, itemId, input); }

  @Put(":id/topics/:itemId/fields")
  @Header("Cache-Control", "no-store")
  updateTopicFields(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body() input: UpdateTopicFieldsDto,
  ) { return this.service.updateTopicFields(id, itemId, input, user); }

  @Delete(":id/topics/:itemId")
  removeTopic(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
  ) { return this.service.removeTopic(id, itemId); }

  @Delete(":id/topics/:itemId/reconciliation")
  removeReconciledTopic(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @CurrentUser() user: User,
  ) { return this.service.removeReconciledTopic(id, itemId, user); }

  @Post(":id/recurrences/:topicId/restore")
  restoreRecurrence(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("topicId", ParseUUIDPipe) topicId: string,
  ) { return this.service.restoreRecurrence(id, topicId); }
}
