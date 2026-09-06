import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  RegisterCustomerDto,
  CreateCustomerDto,
  UpdateCustomerDto,
  ChangeCustomerPasswordDto,
  DeactivateCustomerDto,
  ListCustomersQuery,
  CustomerListItem,
  CustomerDetailResponse,
  CreateAddressDto,
  UpdateAddressDto,
} from "@motorcycle-system/shared-types";
import { AuditService } from "../audit/audit.service.js";
import { AppError } from "../common/errors/app-error.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { normalizePhone } from "../utils/phoneNormalizer.js";

const customerDetailInclude = {
  include: {
    addresses: {
      orderBy: {
        isDefault: "desc" as const,
      },
    },
  },
} satisfies Prisma.CustomerDefaultArgs;

type CustomerDetailRecord = Prisma.CustomerGetPayload<typeof customerDetailInclude>;

@Injectable()
export class CustomersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async register(input: RegisterCustomerDto) {
    const normalizedPhone = normalizePhone(input.phone);
    const normalizedEmail = input.email.toLowerCase();

    // Check for duplicates
    await this.checkDuplicates({
      phone: normalizedPhone,
      email: normalizedEmail,
      nationalId: input.nationalId,
    });

    // Check if customer exists with same phone (POS-created, no password)
    const existing = await this.prisma.customer.findUnique({
      where: { phone: normalizedPhone },
    });

    if (existing) {
      // Account linking: POS customer registering on e-commerce
      if (!existing.passwordHash) {
        const updated = await this.prisma.customer.update({
          where: { id: existing.id },
          data: {
            email: normalizedEmail,
            passwordHash: await hashPassword(input.password),
            nationalId: input.nationalId || existing.nationalId,
          },
        });

        // Create address if provided
        if (input.address) {
          await this.prisma.address.create({
            data: {
              customerId: updated.id,
              label: input.address.label || "Home",
              addressLine: input.address.addressLine,
              city: input.address.city,
              region: input.address.region,
              postalCode: input.address.postalCode,
              country: input.address.country || "Saudi Arabia",
              isDefault: true,
            },
          });
        }

        return {
          id: updated.id,
          name: updated.name,
          phone: updated.phone,
          email: updated.email!,
          nationalId: updated.nationalId,
          isActive: updated.isActive,
          createdAt: updated.createdAt.toISOString(),
        };
      }

      throw new AppError("PHONE_EXISTS", 409, "Phone already exists");
    }

    // Create new customer
    const customer = await this.prisma.customer.create({
      data: {
        name: input.name,
        phone: normalizedPhone,
        email: normalizedEmail,
        passwordHash: await hashPassword(input.password),
        nationalId: input.nationalId,
      },
    });

    // Create address if provided
    if (input.address) {
      await this.prisma.address.create({
        data: {
          customerId: customer.id,
          label: input.address.label || "Home",
          addressLine: input.address.addressLine,
          city: input.address.city,
          region: input.address.region,
          postalCode: input.address.postalCode,
          country: input.address.country || "Saudi Arabia",
          isDefault: true,
        },
      });
    }

    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email!,
      nationalId: customer.nationalId,
      isActive: customer.isActive,
      createdAt: customer.createdAt.toISOString(),
    };
  }

  async create(input: CreateCustomerDto, actor: AuthenticatedUser) {
    const normalizedPhone = normalizePhone(input.phone);
    const normalizedEmail = input.email?.toLowerCase();

    // Check for duplicates
    await this.checkDuplicates({
      phone: normalizedPhone,
      email: normalizedEmail,
      nationalId: input.nationalId,
    });

    const customer = await this.prisma.customer.create({
      data: {
        name: input.name,
        phone: normalizedPhone,
        email: normalizedEmail,
        nationalId: input.nationalId,
        notes: input.notes,
      },
      include: {
        addresses: true,
      },
    });

    // Create address if provided
    if (input.address) {
      await this.prisma.address.create({
        data: {
          customerId: customer.id,
          label: input.address.label || "Home",
          addressLine: input.address.addressLine,
          city: input.address.city,
          region: input.address.region,
          postalCode: input.address.postalCode,
          country: input.address.country || "Saudi Arabia",
          isDefault: true,
        },
      });
    }

    await this.audit.log({
      userId: actor.id,
      action: "customer.create",
      entityType: "customer",
      entityId: customer.id,
      branchId: actor.branchId,
      after: this.auditCustomer(customer),
    });

    // Reload with addresses
    const reloaded = await this.prisma.customer.findUnique({
      where: { id: customer.id },
      include: { addresses: true },
    });

    return this.toCreateCustomerResponse(reloaded!);
  }

  async list(query: ListCustomersQuery, actor: AuthenticatedUser) {
    const where: Prisma.CustomerWhereInput = {};

    // Filters
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { phone: { contains: query.search } },
        { email: { contains: query.search, mode: "insensitive" } },
      ];
    }

    if (query.hasEmail !== undefined) {
      where.email = query.hasEmail ? { not: null } : null;
    }

    if (query.hasNationalId !== undefined) {
      where.nationalId = query.hasNationalId ? { not: null } : null;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    } else {
      // Default: only show active customers
      where.isActive = true;
    }

    if (query.startDate) {
      where.createdAt = { ...((where.createdAt as any) || {}), gte: new Date(query.startDate) };
    }

    if (query.endDate) {
      where.createdAt = { ...((where.createdAt as any) || {}), lte: new Date(query.endDate) };
    }

    // Count total
    const total = await this.prisma.customer.count({ where });

    // Fetch customers
    const customers = await this.prisma.customer.findMany({
      where,
      orderBy: {
        [query.sort]: query.order,
      },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    return {
      data: customers.map((customer) => this.toCustomerListItem(customer)),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async search(q: string, limit: number) {
    const trimmedQ = q?.trim() ?? "";

    // An empty or missing search should browse the active customer list instead of
    // generating a `contains: ""` filter that matches everything unexpectedly.
    if (!trimmedQ) {
      const customers = await this.prisma.customer.findMany({
        where: {
          isActive: true,
        },
        include: {
          addresses: {
            where: { isDefault: true },
            take: 1,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
      });

      return customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        nationalId: customer.nationalId ? this.maskNationalId(customer.nationalId) : null,
        defaultAddress: customer.addresses[0]
          ? {
              id: customer.addresses[0].id,
              addressLine: customer.addresses[0].addressLine,
              city: customer.addresses[0].city,
            }
          : null,
      }));
    }

    // Normalize search term for phone comparison
    const normalizedQ = trimmedQ.replace(/[\s-]/g, "");
    
    // Search strategy for optimal performance:
    // 1. Exact phone match (highest priority)
    // 2. Partial phone match (high priority)
    // 3. Name contains (fuzzy search with ILIKE)
    // 4. Email contains
    // 5. National ID exact match (if looks like national ID)

    const searchConditions: Prisma.CustomerWhereInput[] = [];

    // Always search active customers only
    const baseWhere: Prisma.CustomerWhereInput = { isActive: true };

    // Phone searches (highest priority)
    searchConditions.push({
      ...baseWhere,
      phone: { equals: normalizedQ },
    });

    searchConditions.push({
      ...baseWhere,
      phone: { contains: normalizedQ },
    });

    // Name search (supports Arabic and English)
    searchConditions.push({
      ...baseWhere,
      name: { contains: trimmedQ, mode: "insensitive" },
    });

    // Email search
    searchConditions.push({
      ...baseWhere,
      email: { contains: trimmedQ, mode: "insensitive" },
    });

    // National ID search (if alphanumeric pattern)
    if (/^[a-zA-Z0-9]+$/.test(normalizedQ)) {
      searchConditions.push({
        ...baseWhere,
        nationalId: { equals: normalizedQ },
      });
    }

    // Execute search with OR conditions and get distinct results
    const customers = await this.prisma.customer.findMany({
      where: {
        OR: searchConditions,
      },
      include: {
        addresses: {
          where: { isDefault: true },
          take: 1,
        },
      },
      take: limit,
    });

    // Sort by relevance: exact phone > partial phone > name > email
    const sortedCustomers = customers.sort((a, b) => {
      // Exact phone match
      if (a.phone === normalizedQ && b.phone !== normalizedQ) return -1;
      if (a.phone !== normalizedQ && b.phone === normalizedQ) return 1;

      // Partial phone match
      const aPhoneMatch = a.phone.includes(normalizedQ);
      const bPhoneMatch = b.phone.includes(normalizedQ);
      if (aPhoneMatch && !bPhoneMatch) return -1;
      if (!aPhoneMatch && bPhoneMatch) return 1;

      // Name match (case-insensitive)
      const lowerQ = trimmedQ.toLowerCase();
      const aNameMatch = a.name.toLowerCase().includes(lowerQ);
      const bNameMatch = b.name.toLowerCase().includes(lowerQ);
      if (aNameMatch && !bNameMatch) return -1;
      if (!aNameMatch && bNameMatch) return 1;

      // Email match
      const aEmailMatch = a.email?.toLowerCase().includes(lowerQ);
      const bEmailMatch = b.email?.toLowerCase().includes(lowerQ);
      if (aEmailMatch && !bEmailMatch) return -1;
      if (!aEmailMatch && bEmailMatch) return 1;

      return 0;
    });

    // Return top results with masked national ID
    return sortedCustomers.slice(0, limit).map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      nationalId: customer.nationalId ? this.maskNationalId(customer.nationalId) : null,
      defaultAddress: customer.addresses[0]
        ? {
            id: customer.addresses[0].id,
            addressLine: customer.addresses[0].addressLine,
            city: customer.addresses[0].city,
          }
        : null,
    }));
  }

  async getById(id: string, actor: AuthenticatedUser): Promise<CustomerDetailResponse> {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      ...customerDetailInclude,
    });

    if (!customer) {
      throw new AppError("CUSTOMER_NOT_FOUND", 404, "Customer not found");
    }

    // Check access: customer can only view their own data
    const isCustomerRole = actor.roleName === "customer";
    if (isCustomerRole && actor.id !== customer.id) {
      throw new AppError("FORBIDDEN", 403, "Access denied");
    }

    return this.toCustomerDetailResponse(customer, isCustomerRole);
  }

  async update(id: string, input: UpdateCustomerDto, actor: AuthenticatedUser) {
    const current = await this.prisma.customer.findUnique({ where: { id } });

    if (!current) {
      throw new AppError("CUSTOMER_NOT_FOUND", 404, "Customer not found");
    }

    // Check access: customer can only update their own data
    const isCustomerRole = actor.roleName === "customer";
    if (isCustomerRole && actor.id !== current.id) {
      throw new AppError("FORBIDDEN", 403, "Access denied");
    }

    // Customers cannot update isActive or notes
    if (isCustomerRole) {
      if (input.isActive !== undefined) {
        throw new AppError("FORBIDDEN", 403, "Customers cannot change active status");
      }
      if (input.notes !== undefined) {
        throw new AppError("FORBIDDEN", 403, "Customers cannot modify notes");
      }
    }

    // Normalize and check duplicates if changing unique fields
    const normalizedPhone = input.phone ? normalizePhone(input.phone) : undefined;
    const normalizedEmail = input.email?.toLowerCase();

    if (normalizedPhone || normalizedEmail || input.nationalId) {
      await this.checkDuplicates({
        phone: normalizedPhone !== current.phone ? normalizedPhone : undefined,
        email: normalizedEmail !== current.email ? normalizedEmail : undefined,
        nationalId: input.nationalId !== current.nationalId ? input.nationalId : undefined,
      });
    }

    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        name: input.name,
        phone: normalizedPhone,
        email: normalizedEmail,
        nationalId: input.nationalId,
        notes: input.notes,
        isActive: input.isActive,
      },
      ...customerDetailInclude,
    });

    await this.audit.log({
      userId: actor.id,
      isCustomerActor: actor.isCustomer,
      action: "customer.update",
      entityType: "customer",
      entityId: updated.id,
      branchId: actor.branchId,
      before: this.auditCustomer(current),
      after: this.auditCustomer(updated),
    });

    return this.toCustomerDetailResponse(updated, isCustomerRole);
  }

  async changePassword(
    id: string,
    input: ChangeCustomerPasswordDto,
    actorId: string,
    isCustomerActor = false,
  ) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });

    if (!customer) {
      throw new AppError("CUSTOMER_NOT_FOUND", 404, "Customer not found");
    }

    if (!customer.passwordHash) {
      throw new AppError("NO_PASSWORD", 400, "Customer does not have a password set");
    }

    // Verify current password
    const passwordMatches = await verifyPassword(input.currentPassword, customer.passwordHash);
    if (!passwordMatches) {
      throw new AppError("INCORRECT_PASSWORD", 401, "Current password is incorrect");
    }

    // Update password
    await this.prisma.customer.update({
      where: { id },
      data: {
        passwordHash: await hashPassword(input.newPassword),
      },
    });

    await this.audit.log({
      userId: actorId,
      isCustomerActor,
      action: "customer.change_password",
      entityType: "customer",
      entityId: id,
    });
  }

  async deactivate(id: string, input: DeactivateCustomerDto, actor: AuthenticatedUser) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });

    if (!customer) {
      throw new AppError("CUSTOMER_NOT_FOUND", 404, "Customer not found");
    }

    if (!customer.isActive) {
      throw new AppError("ALREADY_INACTIVE", 400, "Customer is already inactive");
    }

    // TODO: Check for active obligations when orders/reservations/installments are implemented
    // For now, allow deactivation

    await this.prisma.customer.update({
      where: { id },
      data: { isActive: false },
    });

    await this.audit.log({
      userId: actor.id,
      action: "customer.deactivate",
      entityType: "customer",
      entityId: id,
      branchId: actor.branchId,
      after: { reason: input.reason },
    });
  }

  async reactivate(id: string, actor: AuthenticatedUser) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });

    if (!customer) {
      throw new AppError("CUSTOMER_NOT_FOUND", 404, "Customer not found");
    }

    if (customer.isActive) {
      throw new AppError("ALREADY_ACTIVE", 400, "Customer is already active");
    }

    await this.prisma.customer.update({
      where: { id },
      data: { isActive: true },
    });

    await this.audit.log({
      userId: actor.id,
      action: "customer.reactivate",
      entityType: "customer",
      entityId: id,
      branchId: actor.branchId,
    });
  }

  // Address Management

  async addAddress(customerId: string, input: CreateAddressDto, actor: AuthenticatedUser) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });

    if (!customer) {
      throw new AppError("CUSTOMER_NOT_FOUND", 404, "Customer not found");
    }

    // Check access: customer can only manage their own addresses
    const isCustomerRole = actor.roleName === "customer";
    if (isCustomerRole && actor.id !== customerId) {
      throw new AppError("FORBIDDEN", 403, "Access denied");
    }

    // Check if this is the first address
    const existingAddresses = await this.prisma.address.findMany({
      where: { customerId },
    });

    const isFirstAddress = existingAddresses.length === 0;
    const shouldBeDefault = input.isDefault || isFirstAddress;

    // Use transaction to handle default flag
    const address = await this.prisma.$transaction(async (tx) => {
      // If setting as default, unset other defaults
      if (shouldBeDefault) {
        await tx.address.updateMany({
          where: { customerId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.address.create({
        data: {
          customerId,
          label: input.label || "Home",
          addressLine: input.addressLine,
          city: input.city,
          region: input.region,
          postalCode: input.postalCode,
          country: input.country || "Saudi Arabia",
          isDefault: shouldBeDefault,
          notes: input.notes,
        },
      });
    });

    const actorId = actor.id;
    const branchId = "branchId" in actor ? actor.branchId : undefined;

    await this.audit.log({
      userId: actorId,
      isCustomerActor: actor.isCustomer,
      action: "address.create",
      entityType: "address",
      entityId: address.id,
      branchId,
      after: this.auditAddress(address),
    });

    return {
      id: address.id,
      customerId: address.customerId,
      label: address.label,
      addressLine: address.addressLine,
      city: address.city,
      region: address.region,
      postalCode: address.postalCode,
      country: address.country,
      isDefault: address.isDefault,
      notes: address.notes,
      createdAt: address.createdAt.toISOString(),
    };
  }

  async listAddresses(customerId: string, actor: AuthenticatedUser) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });

    if (!customer) {
      throw new AppError("CUSTOMER_NOT_FOUND", 404, "Customer not found");
    }

    // Check access: customer can only view their own addresses
    const isCustomerRole = actor.roleName === "customer";
    if (isCustomerRole && actor.id !== customerId) {
      throw new AppError("FORBIDDEN", 403, "Access denied");
    }

    const addresses = await this.prisma.address.findMany({
      where: { customerId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    return addresses.map((addr) => ({
      id: addr.id,
      label: addr.label,
      addressLine: addr.addressLine,
      city: addr.city,
      region: addr.region,
      postalCode: addr.postalCode,
      country: addr.country,
      isDefault: addr.isDefault,
      notes: addr.notes,
      createdAt: addr.createdAt.toISOString(),
    }));
  }

  async updateAddress(customerId: string, addressId: string, input: UpdateAddressDto, actor: AuthenticatedUser) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });

    if (!customer) {
      throw new AppError("CUSTOMER_NOT_FOUND", 404, "Customer not found");
    }

    // Check access: customer can only update their own addresses
    const isCustomerRole = actor.roleName === "customer";
    if (isCustomerRole && actor.id !== customerId) {
      throw new AppError("FORBIDDEN", 403, "Access denied");
    }

    const current = await this.prisma.address.findUnique({ where: { id: addressId } });

    if (!current) {
      throw new AppError("ADDRESS_NOT_FOUND", 404, "Address not found");
    }

    if (current.customerId !== customerId) {
      throw new AppError("ADDRESS_NOT_FOUND", 404, "Address not found");
    }

    // Use transaction to handle default flag
    const updated = await this.prisma.$transaction(async (tx) => {
      // If setting as default, unset other defaults
      if (input.isDefault === true && !current.isDefault) {
        await tx.address.updateMany({
          where: { customerId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.address.update({
        where: { id: addressId },
        data: {
          label: input.label,
          addressLine: input.addressLine,
          city: input.city,
          region: input.region,
          postalCode: input.postalCode,
          country: input.country,
          isDefault: input.isDefault,
          notes: input.notes,
        },
      });
    });

    const actorId = actor.id;
    const branchId = "branchId" in actor ? actor.branchId : undefined;

    await this.audit.log({
      userId: actorId,
      isCustomerActor: actor.isCustomer,
      action: "address.update",
      entityType: "address",
      entityId: updated.id,
      branchId,
      before: this.auditAddress(current),
      after: this.auditAddress(updated),
    });

    return {
      id: updated.id,
      label: updated.label,
      addressLine: updated.addressLine,
      city: updated.city,
      region: updated.region,
      postalCode: updated.postalCode,
      country: updated.country,
      isDefault: updated.isDefault,
      notes: updated.notes,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async deleteAddress(customerId: string, addressId: string, actor: AuthenticatedUser) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });

    if (!customer) {
      throw new AppError("CUSTOMER_NOT_FOUND", 404, "Customer not found");
    }

    // Check access: customer can only delete their own addresses
    const isCustomerRole = actor.roleName === "customer";
    if (isCustomerRole && actor.id !== customerId) {
      throw new AppError("FORBIDDEN", 403, "Access denied");
    }

    const address = await this.prisma.address.findUnique({ where: { id: addressId } });

    if (!address) {
      throw new AppError("ADDRESS_NOT_FOUND", 404, "Address not found");
    }

    if (address.customerId !== customerId) {
      throw new AppError("ADDRESS_NOT_FOUND", 404, "Address not found");
    }

    // Check if there are other addresses
    const allAddresses = await this.prisma.address.findMany({
      where: { customerId },
    });

    // Cannot delete default address if other addresses exist
    if (address.isDefault && allAddresses.length > 1) {
      throw new AppError("CANNOT_DELETE_DEFAULT_ADDRESS", 409, "Cannot delete default address when other addresses exist. Set another address as default first.");
    }

    // Use transaction to handle deletion and default promotion
    await this.prisma.$transaction(async (tx) => {
      // Delete the address
      await tx.address.delete({ where: { id: addressId } });

      // If this was the default and there are other addresses, promote the first one
      if (address.isDefault && allAddresses.length > 1) {
        const nextAddress = allAddresses.find((a) => a.id !== addressId);
        if (nextAddress) {
          await tx.address.update({
            where: { id: nextAddress.id },
            data: { isDefault: true },
          });
        }
      }
    });

    const actorId = actor.id;
    const branchId = "branchId" in actor ? actor.branchId : undefined;

    await this.audit.log({
      userId: actorId,
      isCustomerActor: actor.isCustomer,
      action: "address.delete",
      entityType: "address",
      entityId: addressId,
      branchId,
      before: this.auditAddress(address),
    });
  }

  // Customer Summary

  async getSummary(customerId: string, actor: AuthenticatedUser) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });

    if (!customer) {
      throw new AppError("CUSTOMER_NOT_FOUND", 404, "Customer not found");
    }

    // Staff only endpoint - customers cannot access this
    const isCustomerRole = actor.roleName === "customer";
    if (isCustomerRole) {
      throw new AppError("FORBIDDEN", 403, "Access denied");
    }

    // TODO: Aggregate order data from SPEC-005 Orders module when implemented
    // Query: SELECT COUNT(*), SUM(totalAmount) FROM Order WHERE customerId = ?
    const totalOrders = 0;
    const completedOrders = 0;
    const cancelledOrders = 0;
    const totalSpent = 0;

    // TODO: Aggregate payment data from SPEC-008 Payments module when implemented
    // Query: SELECT SUM(amount) FROM Payment WHERE customerId = ?
    const totalPaid = 0;

    // TODO: Calculate outstanding balance from orders and payments
    const outstandingBalance = totalSpent - totalPaid;

    // TODO: Aggregate reservation data from SPEC-006 Reservations module when implemented
    // Query: SELECT COUNT(*) FROM Reservation WHERE customerId = ? AND status = 'active'
    const activeReservations = 0;
    const expiredReservations = 0;

    // TODO: Aggregate installment data from SPEC-009 Installments module when implemented
    // Query: SELECT COUNT(*) FROM InstallmentPlan WHERE customerId = ? AND status = 'active'
    const activeInstallmentPlans = 0;
    const overdueInstallments = 0;

    // TODO: Get last order date from SPEC-005 Orders module when implemented
    // Query: SELECT MAX(createdAt) FROM Order WHERE customerId = ?
    const lastOrderDate: string | null = null;

    // TODO: Get last payment date from SPEC-008 Payments module when implemented
    // Query: SELECT MAX(createdAt) FROM Payment WHERE customerId = ?
    const lastPaymentDate: string | null = null;

    return {
      customerId,
      totalOrders,
      completedOrders,
      cancelledOrders,
      totalSpent,
      totalPaid,
      outstandingBalance,
      activeReservations,
      expiredReservations,
      activeInstallmentPlans,
      overdueInstallments,
      lastOrderDate,
      lastPaymentDate,
    };
  }

  private async checkDuplicates(fields: {
    phone?: string;
    email?: string;
    nationalId?: string;
  }) {
    if (fields.phone) {
      const existing = await this.prisma.customer.findUnique({
        where: { phone: fields.phone },
      });
      if (existing) {
        throw new AppError("PHONE_EXISTS", 409, "Phone already exists");
      }
    }

    if (fields.email) {
      const existing = await this.prisma.customer.findFirst({
        where: { email: { equals: fields.email, mode: "insensitive" } },
      });
      if (existing) {
        throw new AppError("EMAIL_EXISTS", 409, "Email already exists");
      }
    }

    if (fields.nationalId) {
      const existing = await this.prisma.customer.findUnique({
        where: { nationalId: fields.nationalId },
      });
      if (existing) {
        throw new AppError("NATIONAL_ID_EXISTS", 409, "National ID already exists");
      }
    }
  }

  private maskNationalId(nationalId: string): string {
    if (nationalId.length <= 4) {
      return nationalId;
    }
    return "******" + nationalId.slice(-4);
  }

  private toCustomerListItem(customer: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    nationalId: string | null;
    isActive: boolean;
    createdAt: Date;
  }): CustomerListItem {
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      nationalId: customer.nationalId ? this.maskNationalId(customer.nationalId) : null,
      isActive: customer.isActive,
      createdAt: customer.createdAt.toISOString(),
    };
  }

  private toCustomerDetailResponse(customer: CustomerDetailRecord, isCustomer: boolean): CustomerDetailResponse {
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      passwordHash: undefined, // Never expose password hash
      nationalId: customer.nationalId, // Full national ID in detail view
      address: customer.address,
      notes: isCustomer ? undefined : customer.notes, // Don't show notes to customers
      isActive: customer.isActive,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
      addresses: customer.addresses.map((addr) => ({
        id: addr.id,
        customerId: addr.customerId,
        label: addr.label,
        addressLine: addr.addressLine,
        city: addr.city,
        region: addr.region,
        postalCode: addr.postalCode,
        country: addr.country,
        isDefault: addr.isDefault,
        notes: addr.notes,
        createdAt: addr.createdAt.toISOString(),
        updatedAt: addr.updatedAt.toISOString(),
      })),
    };
  }

  private toCreateCustomerResponse(customer: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    nationalId: string | null;
    isActive: boolean;
    notes: string | null;
    createdAt: Date;
    addresses: Array<{
      id: string;
      label: string;
      addressLine: string;
      city: string | null;
      isDefault: boolean;
    }>;
  }) {
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      nationalId: customer.nationalId,
      isActive: customer.isActive,
      notes: customer.notes,
      addresses: customer.addresses.map((addr) => ({
        id: addr.id,
        label: addr.label,
        addressLine: addr.addressLine,
        city: addr.city,
        isDefault: addr.isDefault,
      })),
      createdAt: customer.createdAt.toISOString(),
    };
  }

  private auditCustomer(customer: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    nationalId: string | null;
    isActive: boolean;
  }): Prisma.InputJsonObject {
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      nationalId: customer.nationalId,
      isActive: customer.isActive,
    };
  }

  private auditAddress(address: {
    id: string;
    customerId: string;
    label: string;
    addressLine: string;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string;
    isDefault: boolean;
  }): Prisma.InputJsonObject {
    return {
      id: address.id,
      customerId: address.customerId,
      label: address.label,
      addressLine: address.addressLine,
      city: address.city,
      region: address.region,
      postalCode: address.postalCode,
      country: address.country,
      isDefault: address.isDefault,
    };
  }
// TASK-008: Customer Financing API

  /**
   * Get customer financing summary
   * Returns aggregate data about customer's financing activity
   */
  async getFinancingSummary(customerId: string, actor: AuthenticatedUser) {
    // Access control
    const isCustomer = actor.roleName === 'customer';
    const isSuperAdmin = actor.roleName === 'super_admin';

    // Customers can only view their own financing
    if (isCustomer && actor.id !== customerId) {
      throw new AppError('FORBIDDEN', 403, 'Access denied to customer financing data');
    }

    // Verify customer exists and apply branch isolation for staff
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new AppError('CUSTOMER_NOT_FOUND', 404, 'Customer not found');
    }

    // Branch isolation for staff (non-super_admin)
    const branchFilter = (!isCustomer && !isSuperAdmin && actor.branchId)
      ? { branchId: actor.branchId }
      : {};

    // Get active contracts with installments
    const activeContracts = await this.prisma.financingContract.findMany({
      where: {
        customerId,
        status: 'active',
        ...branchFilter,
      },
      include: {
        installments: {
          orderBy: {
            dueDate: 'asc',
          },
        },
      },
    });

    // Calculate summary data
    const totalFinanced = activeContracts.reduce(
      (sum, contract) => sum + Number(contract.totalAmount) - Number(contract.downPayment),
      0
    );

    const totalPaid = activeContracts.reduce(
      (sum, contract) =>
        sum +
        contract.installments.reduce(
          (instSum, inst) => instSum + Number(inst.paidAmount),
          0
        ),
      0
    );

    const totalRemaining = totalFinanced - totalPaid;

    // Find next upcoming/due installment
    const allInstallments = activeContracts.flatMap((c) => c.installments);
    const unpaidInstallments = allInstallments
      .filter((inst) => inst.status !== 'paid')
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    const nextInstallment = unpaidInstallments.length > 0
      ? {
          id: unpaidInstallments[0].id,
          dueDate: unpaidInstallments[0].dueDate.toISOString(),
          amount: Number(unpaidInstallments[0].amount),
          contractId: unpaidInstallments[0].contractId,
        }
      : null;

    // Count overdue installments
    const overdueInstallments = allInstallments.filter(
      (inst) => inst.status === 'overdue'
    );

    const overdueAmount = overdueInstallments.reduce(
      (sum, inst) => sum + (Number(inst.amount) - Number(inst.paidAmount)),
      0
    );

    return {
      activeContracts: activeContracts.length,
      totalFinanced,
      totalPaid,
      totalRemaining,
      nextInstallment,
      overdueInstallments: overdueInstallments.length,
      overdueAmount,
    };
  }

  /**
   * Get customer financing contracts with pagination and filtering
   */
  async getFinancingContracts(
    customerId: string,
    query: {
      status?: string;
      page?: number;
      limit?: number;
    },
    actor: AuthenticatedUser
  ) {
    // Access control
    const isCustomer = actor.roleName === 'customer';
    const isSuperAdmin = actor.roleName === 'super_admin';

    // Customers can only view their own financing
    if (isCustomer && actor.id !== customerId) {
      throw new AppError('FORBIDDEN', 403, 'Access denied to customer financing data');
    }

    // Verify customer exists and apply branch isolation for staff
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new AppError('CUSTOMER_NOT_FOUND', 404, 'Customer not found');
    }

    // Branch isolation for staff (non-super_admin)
    const branchFilter = (!isCustomer && !isSuperAdmin && actor.branchId)
      ? { branchId: actor.branchId }
      : {};

    // Build where clause
    const where: Prisma.FinancingContractWhereInput = {
      customerId,
      ...branchFilter,
    };

    if (query.status) {
      where.status = query.status as any;
    }

    // Pagination
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    // Execute queries
    const [contracts, total] = await Promise.all([
      this.prisma.financingContract.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
            },
          },
          branch: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
            },
          },
          installments: {
            select: {
              id: true,
              installmentNumber: true,
              dueDate: true,
              amount: true,
              paidAmount: true,
              status: true,
              paidAt: true,
            },
            orderBy: {
              installmentNumber: 'asc',
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.financingContract.count({ where }),
    ]);

    // Format response (filter sensitive data if customer)
    const data = contracts.map((contract) => ({
      id: contract.id,
      contractNumber: contract.contractNumber,
      totalAmount: Number(contract.totalAmount),
      downPayment: Number(contract.downPayment),
      financingAmount: Number(contract.totalAmount) - Number(contract.downPayment),
      numberOfInstallments: contract.numberOfInstallments,
      interestRate: Number(contract.interestRate),
      startDate: contract.startDate.toISOString(),
      status: contract.status,
      order: contract.order,
      branch: contract.branch,
      installments: contract.installments.map((inst) => ({
        id: inst.id,
        installmentNumber: inst.installmentNumber,
        dueDate: inst.dueDate.toISOString(),
        amount: Number(inst.amount),
        paidAmount: Number(inst.paidAmount),
        remainingAmount: Number(inst.amount) - Number(inst.paidAmount),
        status: inst.status,
        paidAt: inst.paidAt?.toISOString() || null,
      })),
      createdAt: contract.createdAt.toISOString(),
      completedAt: contract.completedAt?.toISOString() || null,
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
