import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

type ApiDocumentationOptions = {
  tags: string[];
  summary: string;
  description: string;
  protected?: boolean;
};

export function ApiDocumentation(options: ApiDocumentationOptions) {
  return applyDecorators(
    ApiTags(...options.tags),
    ApiOperation({ summary: options.summary, description: options.description }),
    ...(options.protected ? [ApiBearerAuth('JWT')] : []),
    ApiResponse({ status: 200, description: 'Request completed successfully' }),
    ApiResponse({ status: 201, description: 'Resource created successfully' }),
    ApiResponse({ status: 400, description: 'Invalid request data' }),
    ApiResponse({ status: 401, description: 'Unauthorized' }),
    ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' }),
    ApiResponse({ status: 404, description: 'Resource not found' }),
  );
}