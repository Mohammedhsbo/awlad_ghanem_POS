import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { ZodError } from "zod";
import { AppError } from "../errors/app-error.js";

function readDomainError(exception: HttpException) {
  const body = exception.getResponse();

  if (typeof body !== "object" || body === null) {
    return { code: undefined, message: undefined, details: undefined };
  }

  const record = body as Record<string, unknown>;

  return {
    code: typeof record.code === "string" ? record.code : undefined,
    message: typeof record.message === "string" ? record.message : undefined,
    details: record.details,
  };
}

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();

    if (exception instanceof AppError) {
      return response.status(exception.statusCode).json({
        success: false,
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
        },
      });
    }

    if (exception instanceof ZodError) {
      return response.status(422).json({
        success: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Validation failed",
          details: exception.flatten(),
        },
      });
    }

    if (exception instanceof BadRequestException) {
      const domain = readDomainError(exception);

      // Pipes and validators throw a plain BadRequestException; only a service
      // that supplied its own `code` gets to keep it.
      if (!domain.code) {
        return response.status(422).json({
          success: false,
          error: {
            code: "VALIDATION_FAILED",
            message: "Validation failed",
            details: exception.getResponse(),
          },
        });
      }

      return response.status(exception.getStatus()).json({
        success: false,
        error: domain,
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const domain = readDomainError(exception);

      return response.status(status).json({
        success: false,
        error: {
          code: domain.code ?? (status === HttpStatus.FORBIDDEN ? "FORBIDDEN" : exception.name),
          message: domain.message ?? exception.message,
          ...(domain.details === undefined ? {} : { details: domain.details }),
        },
      });
    }

    console.error(exception);
    return response.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
      },
    });
  }
}
