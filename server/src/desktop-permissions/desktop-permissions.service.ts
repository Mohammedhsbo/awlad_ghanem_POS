import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AppError } from "../common/errors/app-error.js";

export interface PagePermission {
  pageKey: string;
  canView: boolean;
  canEdit: boolean;
}

/** All controllable desktop page keys */
export const DESKTOP_PAGE_KEYS = [
  "pos",
  "dashboard",
  "sales",
  "pos-installments",
  "orders",
  "reservations",
  "offline-sync",
  "history",
  "inventory",
  "transfers",
  "customers",
  "inquiries",
  "installments",
  "reports",
  "notifications",
  "suppliers",
  "financing-companies",
  "printers",
] as const;

export type DesktopPageKey = (typeof DESKTOP_PAGE_KEYS)[number];

@Injectable()
export class DesktopPermissionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /**
   * Returns the full permission set for a user.
   * Any page not explicitly stored defaults to canView=true, canEdit=true.
   */
  async getForUser(userId: string): Promise<PagePermission[]> {
    await this.assertUserExists(userId);

    const stored = await this.prisma.desktopPermission.findMany({
      where: { userId },
    });

    return DESKTOP_PAGE_KEYS.map((key) => {
      const found = stored.find((p) => p.pageKey === key);
      return {
        pageKey: key,
        canView: found ? found.canView : true,
        canEdit: found ? found.canEdit : true,
      };
    });
  }

  /**
   * Bulk-upsert permissions for a user.
   * Only super_admin can call this.
   */
  async setForUser(
    userId: string,
    permissions: PagePermission[],
  ): Promise<PagePermission[]> {
    await this.assertUserExists(userId);

    // Validate all page keys
    for (const p of permissions) {
      if (!DESKTOP_PAGE_KEYS.includes(p.pageKey as DesktopPageKey)) {
        throw new AppError(
          "INVALID_PAGE_KEY",
          422,
          `Unknown page key: ${p.pageKey}`,
        );
      }
    }

    await this.prisma.$transaction(
      permissions.map((p) =>
        this.prisma.desktopPermission.upsert({
          where: { userId_pageKey: { userId, pageKey: p.pageKey } },
          create: {
            userId,
            pageKey: p.pageKey,
            canView: p.canView,
            canEdit: p.canEdit,
          },
          update: {
            canView: p.canView,
            canEdit: p.canEdit,
          },
        }),
      ),
    );

    return this.getForUser(userId);
  }

  /**
   * Resets all desktop permissions for a user back to defaults (all true).
   */
  async resetForUser(userId: string): Promise<void> {
    await this.assertUserExists(userId);
    await this.prisma.desktopPermission.deleteMany({ where: { userId } });
  }

  private async assertUserExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      throw new AppError("USER_NOT_FOUND", 404, "User not found");
    }
  }
}
