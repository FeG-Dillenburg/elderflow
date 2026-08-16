import { BadRequestException, PipeTransform } from "@nestjs/common";
import { MeetingDocumentUpdateDto, MeetingDto, MeetingTopicDto } from "./dto/meeting.dto";
import { decodeMeetingCreateBody, decodeMeetingTopicBody } from "./meeting-create-binary";

export class MeetingCreateBinaryPipe implements PipeTransform<unknown, MeetingDto> {
  transform(value: unknown): MeetingDto {
    if (!Buffer.isBuffer(value)) return invalid();
    return decodeMeetingCreateBody(value);
  }
}

export class MeetingUpdateBinaryPipe implements PipeTransform<unknown, MeetingDocumentUpdateDto> {
  transform(value: unknown): MeetingDocumentUpdateDto {
    if (!Buffer.isBuffer(value)) return invalid();
    if (value.length === 0 || value.length > 1_050_000) return invalid();
    return { envelope: value.toString("base64url") };
  }
}

export class MeetingSnapshotBinaryPipe implements PipeTransform<unknown, MeetingDocumentUpdateDto> {
  transform(value: unknown): MeetingDocumentUpdateDto {
    if (!Buffer.isBuffer(value)) return invalid();
    if (value.length === 0 || value.length > 16_800_000) return invalid();
    return { envelope: value.toString("base64url") };
  }
}

export class MeetingTopicBinaryPipe implements PipeTransform<unknown, MeetingTopicDto> {
  transform(value: unknown): MeetingTopicDto {
    if (!Buffer.isBuffer(value)) return invalid();
    return decodeMeetingTopicBody(value);
  }
}

function invalid(): never {
  throw new BadRequestException({
    code: "E2EE_BINARY_BODY_INVALID",
    message: "A binary E2EE body is required",
  });
}
