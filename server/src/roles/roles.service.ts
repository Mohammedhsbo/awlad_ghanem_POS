import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AppError } from "../common/errors/app-error.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class RolesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.role.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        isSystem: true,
      },
      orderBy: { name: "asc" },
    });
  }

  async getById(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        isSystem: true,
        permissions: {
          select: {
            resource: true,
            action: true,
          },
          orderBy: [{ resource: "asc" }, { action: "asc" }],
        },
      },
    });

    if (!role) {
      throw new AppError("ROLE_NOT_FOUND", 404, "Role not found");
    }

    return role;
  }
}
