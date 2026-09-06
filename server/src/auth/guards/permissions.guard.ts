import { Inject, CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Action, Resource } from "@motorcycle-system/shared-types";
import { AppError } from "../../common/errors/app-error.js";
import type { AuthenticatedRequest } from "../../common/types/authenticated-request.js";
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator.js";

interface RequiredPermission {
  resource: Resource;
  action: Action;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) { }

  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<RequiredPermission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new AppError("TOKEN_INVALID", 401, "Authentication token is required");
    }

    // super_admin is an all-access identity everywhere else in the app (it is
    // what `isSuperAdmin` gates branch scoping on), so it must not be lockable
    // out here by a role row that predates a newly added resource.
    if (user.isSuperAdmin) {
      return true;
    }

    const allowed = required.every((permission) =>
      user.permissions.some(
        (userPermission) =>
          userPermission.resource === permission.resource && userPermission.action === permission.action,
      ),
    );

    if (!allowed) {
      throw new AppError("FORBIDDEN", 403, "Insufficient permissions");
    }

    return true;
  }
}
