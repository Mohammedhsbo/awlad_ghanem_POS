import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";

@Injectable()
export class PosReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(branchId?: string) {
    return this.prisma.posReservation.findMany({
      where: branchId ? { branchId } : undefined,
      include: {
        motorcycle: { include: { brand: true } },
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
      holdAmount: number;
    }
  ) {
    return this.prisma.posReservation.create({
      data: {
        ...input,
        branchId: user.branchId,
        createdBy: user.id,
      },
      include: {
        motorcycle: { include: { brand: true } },
      },
    });
  }

  async cancel(id: string) {
    const reservation = await this.prisma.posReservation.findUnique({
      where: { id },
    });

    if (!reservation) {
      throw new BadRequestException("Reservation not found");
    }
    if (reservation.status !== "ACTIVE") {
      throw new BadRequestException("Reservation is not active");
    }

    const msPerDay = 1000 * 60 * 60 * 24;
    const daysElapsed = Math.floor((Date.now() - reservation.reservationDate.getTime()) / msPerDay);
    
    let refundAmount = Number(reservation.holdAmount);
    
    // Business rule: if cancelled after 8 days from reservation date, deduct 300 EGP
    if (daysElapsed > 8) {
      refundAmount = Math.max(0, refundAmount - 300);
    }

    const updated = await this.prisma.posReservation.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    return {
      ...updated,
      daysElapsed,
      refundAmount,
      penaltyApplied: daysElapsed > 8,
    };
  }
}
