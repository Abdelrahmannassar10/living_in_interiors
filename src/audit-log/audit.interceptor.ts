import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { Observable, tap } from 'rxjs';
import { AuditLog } from './entities/audit-log.entity';

const SENSITIVE_KEYS = [
  'password',
  'currentPassword',
  'newPassword',
  'refreshToken',
  'token',
];

function sanitize(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!SENSITIVE_KEYS.includes(key)) result[key] = entry;
  }
  return result;
}

/**
 * First-cut HTTP audit trail: logs every successful mutating request
 * (who, what route, which entity/id, sanitized body, IP, user-agent).
 * Stock transactions additionally write their own richer audit row inside
 * the DB transaction, so /transactions routes are skipped here.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { id: number; username: string } }>();
    const method = request.method;
    const path = request.originalUrl ?? request.url ?? '';
    const isMutation = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);
    if (
      !isMutation ||
      path.includes('/auth/') ||
      path.includes('/transactions')
    )
      return next.handle();

    return next.handle().pipe(
      tap(() => {
        const entity =
          path.split('?')[0].split('/').filter(Boolean)[2] ?? 'unknown';
        const entityId =
          Object.values(request.params ?? {})[0]?.toString() ?? null;
        const action =
          method === 'POST'
            ? 'create'
            : method === 'DELETE'
              ? 'delete'
              : 'update';
        void this.logs
          .save(
            this.logs.create({
              userId: request.user?.id ?? null,
              userName: request.user?.username ?? null,
              action,
              entity,
              entityId,
              newValues: sanitize(request.body),
              ipAddress: request.ip ?? null,
              userAgent: request.headers['user-agent'] ?? null,
            }),
          )
          .catch(() => undefined);
      }),
    );
  }
}
