import { Body, Controller, Header, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { IsBoolean, IsNotEmpty, IsString, IsUUID } from "class-validator";
import { CurrentUser } from "../auth/current-user.decorator";
import { User } from "../users/user.entity";
import { MentionWorkflowService } from "./mention-workflow.service";

class MentionStateDto {
  @IsBoolean()
  done: boolean;
}
class MentionCommentDto {
  @IsUUID()
  id: string;

  @IsString()
  @IsNotEmpty()
  textEnvelope: string;
}

// Authentication is supplied by the global guard. The service authorizes every
// operation against the authenticated owner and existing Protected-text access.
@Controller("api/mentions")
export class MentionWorkflowController {
  constructor(private readonly workflow: MentionWorkflowService) {}

  @Put(":id/state")
  @Header("Cache-Control", "no-store")
  setState(@Param("id", ParseUUIDPipe) id: string, @Body() input: MentionStateDto, @CurrentUser() user: User) {
    return this.workflow.setState(id, input.done, user);
  }

  @Post(":id/done-and-comment")
  @Header("Cache-Control", "no-store")
  comment(@Param("id", ParseUUIDPipe) id: string, @Body() input: MentionCommentDto, @CurrentUser() user: User) {
    return this.workflow.setState(id, true, user, input);
  }
}
