import { SetMetadata } from "@nestjs/common";
import type { Action, Resource } from "@motorcycle-system/shared-types";

export const PERMISSIONS_KEY = "permissions";

export function RequirePermission(resource: Resource, action: Action) {
  return SetMetadata(PERMISSIONS_KEY, [{ resource, action }]);
}
