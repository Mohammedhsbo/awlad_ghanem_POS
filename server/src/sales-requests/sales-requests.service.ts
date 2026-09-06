import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";

@Injectable()
export class SalesRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(branchId?: string) {
    return this.prisma.saleRequest.findMany({
      where: branchId ? { branchId } : undefined,
      include: {
        motorcycle: { include: { brand: true } },
        financingCompany: true,
        user: true,
        branch: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(
    user: AuthenticatedUser,
    input: {
      customerName: string;
      customerPhone: string;
      motorcycleId: string;
      financingCompanyId: string;
      requestedAmount: number;
    }
  ) {
    return this.prisma.saleRequest.create({
      data: {
        ...input,
        branchId: user.branchId,
        createdBy: user.id,
      },
      include: {
        motorcycle: { include: { brand: true } },
        financingCompany: true,
      },
    });
  }
}
