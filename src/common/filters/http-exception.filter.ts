import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : ((exceptionResponse as { message?: string | string[] }).message ??
            message);
    } else if (exception instanceof QueryFailedError) {
      const code =
        (exception as QueryFailedError & { code?: string }).code ??
        (exception.driverError as { code?: string } | undefined)?.code;
      if (code === '23505') {
        status = HttpStatus.CONFLICT;
        message = 'A record with this value already exists';
      } else if (code === '23503') {
        status = HttpStatus.BAD_REQUEST;
        message = 'This operation references a record that does not exist';
      } else {
        this.logger.error(
          exception instanceof Error ? exception.stack : exception,
        );
      }
    } else {
      this.logger.error(
        exception instanceof Error ? exception.stack : exception,
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message: Array.isArray(message) ? 'Validation failed' : message,
      ...(Array.isArray(message) ? { errors: message } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
