import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

export const codedHttpException = (
  status: HttpStatus,
  code: string,
  message: string,
  params?: Record<string, unknown>,
): HttpException => {
  const response = { code, message, ...(params ? { params } : {}) };
  const exception = status === HttpStatus.BAD_REQUEST
    ? new BadRequestException(response)
    : status === HttpStatus.UNAUTHORIZED
      ? new UnauthorizedException(response)
      : status === HttpStatus.FORBIDDEN
        ? new ForbiddenException(response)
        : status === HttpStatus.NOT_FOUND
          ? new NotFoundException(response)
          : status === HttpStatus.CONFLICT
            ? new ConflictException(response)
            : new HttpException(response, status);
  exception.message = message;
  return exception;
};
