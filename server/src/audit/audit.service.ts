import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";

interface AuditInput {
  /**
   * Id of whoever performed the action: a User by default, a Customer when
   * `isCustomerActor`, or null for work done by a background job.
   */
  userId?: string | null;
  customerId?: string | null;
  /**
   * Set when the actor signed in through the customer portal. Customers are
   * rows in `Customer`, so writing their id to `AuditLog.userId` violates the
   * foreign key into `User`.
   */
  isCustomerActor?: boolean;
  action: string;
  entityType: string;
  entityId: string;
  branchId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async log(input: AuditInput) {
    await this.prisma.auditLog.create({
      data: {
        userId: input.isCustomerActor ? null : input.userId,
        customerId: input.customerId ?? (input.isCustomerActor ? input.userId : null),
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        branchId: input.branchId ?? null,
        before: input.before ?? undefined,
        after: input.after ?? undefined,
      },
    });
  }
}
