import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from "@nestjs/common";
import { Action, Resource } from "@motorcycle-system/shared-types";
import { RequirePermission } from "../auth/decorators/permissions.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { PermissionsGuard } from "../auth/guards/permissions.guard.js";
import { ApiDocumentation } from "../common/decorators/api-documentation.decorator.js";
import { RolesService } from "./roles.service.js";

@Controller("roles")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(@Inject(RolesService) private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermission(Resource.ROLE, Action.READ)
  @ApiDocumentation({
    tags: ["Admin - Roles"],
    summary: "List roles",
    description: "Lists roles available for staff account assignment.",
    protected: true,
  })
  async list() {
    return {
      success: true,
      data: await this.rolesService.list(),
    };
  }

  @Get(":id")
  @RequirePermission(Resource.ROLE, Action.READ)
  @ApiDocumentation({
    tags: ["Admin - Roles"],
    summary: "Get role permissions",
    description: "Retrieves a role and its permission pairs.",
    protected: true,
  })
  async getById(@Param("id", ParseUUIDPipe) id: string) {
    return {
      success: true,
      data: await this.rolesService.getById(id),
    };
  }
}
