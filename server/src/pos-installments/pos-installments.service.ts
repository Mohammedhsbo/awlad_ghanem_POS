import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";

@Injectable()
export class PosInstallmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(branchId?: string, query?: string) {
    return this.prisma.posInstallmentPlan.findMany({
      where: {
        branchId: branchId ? branchId : undefined,
        OR: query
          ? [
              { customerName: { contains: query, mode: "insensitive" } },
              { customerPhone: { contains: query, mode: "insensitive" } },
            ]
          : undefined,
      },
      include: {
        motorcycle: { include: { brand: true } },
        installments: { orderBy: { dueDate: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async generateFromRequest(
    user: AuthenticatedUser,
    input: { saleRequestId: string; months: number; interestRate: number }
  ) {
    const request = await this.prisma.saleRequest.findUnique({
      where: { id: input.saleRequestId },
    });

    if (!request) {
      throw new NotFoundException("SaleRequest not found");
    }

    if (request.status === "APPROVED") {
      throw new BadRequestException("This request has already been approved");
    }

    // Mark as approved
    await this.prisma.saleRequest.update({
      where: { id: input.saleRequestId },
      data: { status: "APPROVED" },
    });

    const principal = Number(request.requestedAmount);
    const totalAmount = principal + principal * (input.interestRate / 100);
    const installmentAmount = totalAmount / input.months;

    // Create plan
    const plan = await this.prisma.posInstallmentPlan.create({
      data: {
        saleRequestId: request.id,
        customerName: request.customerName,
        customerPhone: request.customerPhone,
        motorcycleId: request.motorcycleId,
        totalAmount,
        remainingBalance: totalAmount,
        branchId: user.branchId,
        createdBy: user.id,
      },
    });

    // Create installments
    const installmentsData = Array.from({ length: input.months }).map((_, i) => {
      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + i + 1); // Starting next month
      return {
        planId: plan.id,
        dueDate,
        amount: installmentAmount,
      };
    });

    await this.prisma.posInstallment.createMany({
      data: installmentsData,
    });

    return this.prisma.posInstallmentPlan.findUnique({
      where: { id: plan.id },
      include: { installments: true },
    });
  }
}
