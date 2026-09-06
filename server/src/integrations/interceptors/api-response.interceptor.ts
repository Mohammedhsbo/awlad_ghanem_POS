// SPEC-014 TASK-002: Standardized API Response Interceptor

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { StandardAPIResponse } from '../types/integration.types.js';

@Injectable()
export class APIResponseInterceptor<T> implements NestInterceptor<T, StandardAPIResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<StandardAPIResponse<T>> {
    const request = context.switchToHttp().getRequest();
    const correlationId = request.headers['x-correlation-id'] || uuidv4();
    const requestId = uuidv4();

    // Attach to request for downstream use
    request.correlationId = correlationId;
    request.requestId = requestId;

    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        meta: {
          correlationId,
          requestId,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
      })),
    );
  }
}
