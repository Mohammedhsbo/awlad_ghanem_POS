import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from '@prisma/client';
import { PrismaService } from "../prisma/prisma.service.js";
import type {
  FinancingCompanyCreate,
  FinancingCompanyUpdate,
  InstallmentDurationCreate,
  InstallmentDurationUpdate,
  InstallmentRequestCreate,
  InstallmentRequestReview,
  InstallmentRequestUpdate,
  InstallmentCalculation,
  SettingsUpdate,
} from "./customer-financing.schemas.js";

@Injectable()
export class CustomerFinancingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listCompanies() {
    return this.prisma.financingCompany.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

  listDurations() {
    return this.prisma.installmentDuration.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { months: "asc" }],
    });
  }

  getSettings() {
    return this.prisma.settings.findUnique({ where: { id: "default" } });
  }

  listAllCompanies() {
    return this.prisma.financingCompany.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  }

  listAllDurations() {
    return this.prisma.installmentDuration.findMany({ orderBy: [{ sortOrder: "asc" }, { months: "asc" }] });
  }

  createCompany(input: FinancingCompanyCreate) {
    const data: Prisma.FinancingCompanyCreateInput = {
      name: input.name,
      whatsappNumber: input.whatsappNumber,
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
    };
    return this.prisma.financingCompany.create({ data });
  }

  updateCompany(id: string, input: FinancingCompanyUpdate) {
    return this.prisma.financingCompany.update({ where: { id }, data: input });
  }

  async deleteCompany(id: string) {
    const count = await this.prisma.installmentRequest.count({ where: { financingCompanyId: id } });
    if (count) throw new ConflictException("A financing company used by an application cannot be deleted; deactivate it instead.");
    return this.prisma.financingCompany.delete({ where: { id } });
  }

  createDuration(input: InstallmentDurationCreate) {
    const data: Prisma.InstallmentDurationCreateInput = {
      months: input.months,
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
    };
    return this.prisma.installmentDuration.create({ data });
  }

  updateDuration(id: string, input: InstallmentDurationUpdate) {
    return this.prisma.installmentDuration.update({ where: { id }, data: input });
  }

  async deleteDuration(id: string) {
    const count = await this.prisma.installmentRequest.count({ where: { installmentDurationId: id } });
    if (count) throw new ConflictException("A duration used by an application cannot be deleted; deactivate it instead.");
    return this.prisma.installmentDuration.delete({ where: { id } });
  }

  upsertSettings(input: SettingsUpdate) {
    return this.prisma.settings.upsert({ where: { id: "default" }, create: { id: "default", ...input }, update: input });
  }

  async createRequest(customerId: string, input: InstallmentRequestCreate) {
    const [motorcycle, company, duration] = await Promise.all([
      this.prisma.motorcycle.findUnique({ where: { id: input.motorcycleId }, select: { id: true, price: true, status: true } }),
      this.prisma.financingCompany.findFirst({ where: { id: input.financingCompanyId, isActive: true } }),
      this.prisma.installmentDuration.findFirst({ where: { id: input.installmentDurationId, isActive: true } }),
    ]);
    if (!motorcycle) throw new NotFoundException("Motorcycle not found");
    if (motorcycle.status !== "available") throw new ConflictException("Motorcycle is not available");
    if (!company) throw new NotFoundException("Financing company not found");
    if (!duration) throw new NotFoundException("Installment duration not found");
    const monthlyInstallment = this.calculateMonthlyInstallment(Number(motorcycle.price), input.downPayment, duration.months);

    const data = {
      ...input,
      customer: { connect: { id: customerId } },
      motorcycle: { connect: { id: input.motorcycleId } },
      financingCompany: { connect: { id: input.financingCompanyId } },
      duration: { connect: { id: input.installmentDurationId } },
      motorcyclePrice: motorcycle.price,
      monthlyInstallment,
      status: "pending",
    } as Prisma.InstallmentRequestCreateInput;

    return this.prisma.installmentRequest.create({
      data,
      include: { financingCompany: true, duration: true, motorcycle: { include: { brand: true } } },
    });
  }

  async calculate(input: InstallmentCalculation) {
    const [motorcycle, duration] = await Promise.all([
      this.prisma.motorcycle.findUnique({ where: { id: input.motorcycleId }, select: { price: true } }),
      this.prisma.installmentDuration.findFirst({ where: { id: input.installmentDurationId, isActive: true }, select: { months: true } }),
    ]);
    if (!motorcycle) throw new NotFoundException("Motorcycle not found");
    if (!duration) throw new NotFoundException("Installment duration not found");
    const price = Number(motorcycle.price);
    return {
      motorcyclePrice: price,
      downPayment: input.downPayment,
      financingAmount: Number((price - input.downPayment).toFixed(2)),
      months: duration.months,
      monthlyInstallment: this.calculateMonthlyInstallment(price, input.downPayment, duration.months),
    };
  }

  private calculateMonthlyInstallment(price: number, downPayment: number, months: number) {
    if (downPayment >= price) throw new BadRequestException("Down payment must be less than the motorcycle price");
    return Number(((price - downPayment) / months).toFixed(2));
  }

  listMine(customerId: string) {
    return this.prisma.installmentRequest.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      include: { financingCompany: true, duration: true, motorcycle: { include: { brand: true } } },
    });
  }

  listRequests(status?: "pending" | "approved" | "rejected") {
    return this.prisma.installmentRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      include: { customer: true, financingCompany: true, duration: true, motorcycle: { include: { brand: true } } },
    });
  }

  async getRequest(id: string) {
    const request = await this.prisma.installmentRequest.findUnique({
      where: { id },
      include: { customer: true, financingCompany: true, duration: true, motorcycle: { include: { brand: true } }, inquiry: true },
    });
    if (!request) throw new NotFoundException("Installment request not found");
    return request;
  }

  async updateRequest(id: string, input: InstallmentRequestUpdate) {
    const current = await this.getRequest(id);
    const data: Record<string, unknown> = { ...input };
    if (input.downPayment !== undefined) {
      const price = Number(current.motorcycle.price);
      if (input.downPayment >= price) throw new BadRequestException("Down payment must be less than the motorcycle price");
      data.monthlyInstallment = Number(((price - input.downPayment) / current.duration.months).toFixed(2));
    }
    return this.prisma.installmentRequest.update({
      where: { id }, data,
      include: { customer: true, financingCompany: true, duration: true, motorcycle: { include: { brand: true } }, inquiry: true },
    });
  }

  async deleteRequest(id: string) {
    await this.getRequest(id);
    return this.prisma.installmentRequest.delete({ where: { id } });
  }

  async whatsappRequest(id: string) {
    const request = await this.getRequest(id);
    const motorcycleName = `${request.motorcycle.brand.nameAr} ${request.motorcycle.model}`;
    const body = `*استعلام جديد*\n\nالعميل: ${request.buyerName}\nالهاتف: ${request.buyerPhone}\nالدراجة: ${motorcycleName}\n${request.downPayment ? `الدفعة المقدمة: ${request.downPayment}\n` : ""}شركة التمويل: ${request.financingCompany.name}\n`;
    return { phone: request.financingCompany.whatsappNumber, message: body };
  }

  reviewRequest(id: string, input: InstallmentRequestReview) {
    return this.prisma.installmentRequest.update({
      where: { id },
      data: { status: input.status, rejectionReason: input.status === "rejected" ? input.rejectionReason ?? null : null, reviewedAt: new Date() },
      include: { customer: true, financingCompany: true, duration: true, motorcycle: true },
    });
  }
}
