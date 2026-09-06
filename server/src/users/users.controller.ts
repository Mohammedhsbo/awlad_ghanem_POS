import {
  Inject,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import {
  Action,
  createUserRequestSchema,
  listUsersQuerySchema,
  resetPasswordRequestSchema,
  selfUpdateUserRequestSchema,
  Resource,
  updateUserRequestSchema,
  type CreateUserRequest,
  type ListUsersQuery,
  type ResetPasswordRequest,
  type UpdateUserRequest,
  type SelfUpdateUserRequest,
} from "@motorcycle-system/shared-types";
import { RequirePermission } from "../auth/decorators/permissions.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { PermissionsGuard } from "../auth/guards/permissions.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import type { AuthenticatedRequest } from "../common/types/authenticated-request.js";
import { UsersService } from "./users.service.js";

@Controller("users")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  @Post()
  @UseGuards(ThrottlerGuard, JwtAuthGuard, PermissionsGuard)
  @Throttle({ default: { ttl: Number(process.env.USER_CREATE_RATE_LIMIT_TTL_MS ?? 60_000), limit: Number(process.env.USER_CREATE_RATE_LIMIT_MAX ?? 10) } })
  @RequirePermission(Resource.USER, Action.CREATE)
  async create(
    @Body(new ZodValidationPipe(createUserRequestSchema)) body: CreateUserRequest,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      success: true,
      data: await this.usersService.create(body, request.user),
    };
  }

  @Get()
  @RequirePermission(Resource.USER, Action.READ)
  async list(
    @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery,
    @Req() request: AuthenticatedRequest,
  ) {
    const result = await this.usersService.list(query, request.user);

    return {
      success: true,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async getMe(@Req() request: AuthenticatedRequest) {
    return {
      success: true,
      data: await this.usersService.getMe(request.user.id),
    };
  }

  @Patch("me")
  @UseGuards(JwtAuthGuard)
  async updateMe(
    @Body(new ZodValidationPipe(selfUpdateUserRequestSchema)) body: SelfUpdateUserRequest,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      success: true,
      data: await this.usersService.updateMe(request.user.id, body),
    };
  }

  @Get(":id")
  @RequirePermission(Resource.USER, Action.READ)
  async getById(@Param("id", ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return {
      success: true,
      data: await this.usersService.getById(id, request.user),
    };
  }

  @Patch(":id")
  @RequirePermission(Resource.USER, Action.UPDATE)
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateUserRequestSchema)) body: UpdateUserRequest,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      success: true,
      data: await this.usersService.update(id, body, request.user),
    };
  }

  @Delete(":id")
  @RequirePermission(Resource.USER, Action.DELETE)
  async delete(@Param("id", ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    await this.usersService.delete(id, request.user);

    return {
      success: true,
      data: null,
    };
  }

  @Post(":id/reset-password")
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Resource.USER, Action.UPDATE)
  async resetPassword(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resetPasswordRequestSchema)) body: ResetPasswordRequest,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.usersService.resetPassword(id, body, request.user);

    return {
      success: true,
      data: null,
    };
  }
}
