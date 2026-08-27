import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

@Injectable()
export class ResponseTransformInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((response: unknown) => {
        if (this.isPaginatedResponse(response)) {
          return { success: true, data: response.data, meta: response.meta };
        }
        return { success: true, data: response };
      }),
    );
  }

  private isPaginatedResponse(response: unknown): response is { data: unknown; meta: unknown } {
    return typeof response === 'object' && response !== null && 'data' in response && 'meta' in response;
  }
}