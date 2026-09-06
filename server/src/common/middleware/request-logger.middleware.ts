import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { recordHttpRequest } from "../../metrics/metrics.store.js";

function writeLog(entry: Record<string, unknown>) {
  console.log(JSON.stringify(entry));
}

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction) {
    const startedAt = Date.now();
    const requestId = request.header("x-request-id") ?? randomUUID();
    const correlationId = request.header("x-correlation-id") ?? requestId;

    response.setHeader("x-request-id", requestId);
    response.setHeader("x-correlation-id", correlationId);

    response.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      recordHttpRequest(request.method, request.route?.path?.toString() ?? request.path, response.statusCode, durationMs);
      writeLog({
        timestamp: new Date().toISOString(),
        level: response.statusCode >= 500 ? "error" : response.statusCode >= 400 ? "warn" : "info",
        service: "api",
        requestId,
        correlationId,
        method: request.method,
        endpoint: request.originalUrl,
        statusCode: response.statusCode,
        durationMs,
        userAgent: request.header("user-agent"),
        remoteAddress: request.ip,
      });
    });

    next();
  }
}
