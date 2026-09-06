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
} from "@nestjs/common";
import {
  Action,
  createCategoryRequestSchema,
  listCategoriesQuerySchema,
  Resource,
  updateCategoryRequestSchema,
  type CreateCategoryRequest,
  type ListCategoriesQuery,
  type UpdateCategoryRequest,
} from "@motorcycle-system/shared-types";
import { RequirePermission } from "../auth/decorators/permissions.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { PermissionsGuard } from "../auth/guards/permissions.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { CategoriesService } from "./categories.service.js";
import { ApiDocumentation } from "../common/decorators/api-documentation.decorator.js";

@Controller("categories")
export class CategoriesController {
  constructor(@Inject(CategoriesService) private readonly categoriesService: CategoriesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.MOTORCYCLE, Action.CREATE)
  @ApiDocumentation({ tags: ['Admin - Categories'], summary: 'Create a category', description: 'Admin creates a motorcycle category.', protected: true })
  async create(
    @Body(new ZodValidationPipe(createCategoryRequestSchema)) body: CreateCategoryRequest,
    @Req() request: any,
  ) {
    return {
      success: true,
      data: await this.categoriesService.create(body, request.user),
    };
  }

  @Get()
  @ApiDocumentation({ tags: ['Web - Categories', 'POS - Inventory Lookup'], summary: 'List categories', description: 'Web storefront and Desktop POS retrieve motorcycle categories.' })
  async list(
    @Query(new ZodValidationPipe(listCategoriesQuerySchema)) query: ListCategoriesQuery,
    @Req() request: any,
  ) {
    // Public endpoint - no authentication required
    const user = request.user || null;
    return {
      success: true,
      data: await this.categoriesService.list(query, user),
    };
  }

  @Get(":id")
  @ApiDocumentation({ tags: ['Web - Categories', 'POS - Inventory Lookup'], summary: 'Get a category', description: 'Web storefront and Desktop POS retrieve category details by ID.' })
  async getById(@Param("id", ParseUUIDPipe) id: string, @Req() request: any) {
    // Public endpoint - no authentication required
    const user = request.user || null;
    return {
      success: true,
      data: await this.categoriesService.getById(id, user),
    };
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.MOTORCYCLE, Action.UPDATE)
  @ApiDocumentation({ tags: ['Admin - Categories'], summary: 'Update a category', description: 'Admin updates a motorcycle category.', protected: true })
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCategoryRequestSchema)) body: UpdateCategoryRequest,
    @Req() request: any,
  ) {
    return {
      success: true,
      data: await this.categoriesService.update(id, body, request.user),
    };
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Resource.MOTORCYCLE, Action.DELETE)
  @ApiDocumentation({ tags: ['Admin - Categories'], summary: 'Remove a category', description: 'Admin removes a motorcycle category.', protected: true })
  async delete(@Param("id", ParseUUIDPipe) id: string, @Req() request: any) {
    await this.categoriesService.delete(id, request.user);

    return {
      success: true,
      data: null,
    };
  }
}