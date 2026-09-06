import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageService } from "../upload/storage.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";


@Injectable()
export class InquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  async list() {
    return this.prisma.inquiry.findMany({
      include: {
        motorcycle: { include: { brand: true } },
        user: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(
    user: AuthenticatedUser,
    input: any,
    files: {
      documentImage?: Express.Multer.File;
      idCardFrontImage?: Express.Multer.File;
      idCardBackImage?: Express.Multer.File;
      guarantorIdFrontImage?: Express.Multer.File;
      guarantorIdBackImage?: Express.Multer.File;
      guarantorSignatureImage?: Express.Multer.File;
    }
  ) {
    const data: any = {
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      address: input.address || null,
      occupation: input.occupation || null,
      documentType: input.documentType,
      downPayment: input.downPayment ? parseFloat(input.downPayment) : null,
      motorcycleId: input.motorcycleId || null,
      financingCompanyId: input.financingCompanyId || null,
      installmentDurationId: input.installmentDurationId || null,
      createdBy: user.id,
      branchId: user.branchId,
    };

    if (files.documentImage) {
      data.documentImage = (await this.storage.uploadFile(files.documentImage, "inquiries")).url;
    }
    if (files.idCardFrontImage) {
      data.idCardFrontImage = (await this.storage.uploadFile(files.idCardFrontImage, "inquiries")).url;
    }
    if (files.idCardBackImage) {
      data.idCardBackImage = (await this.storage.uploadFile(files.idCardBackImage, "inquiries")).url;
    }
    if (files.guarantorIdFrontImage) {
      data.guarantorIdFrontImage = (await this.storage.uploadFile(files.guarantorIdFrontImage, "inquiries")).url;
    }
    if (files.guarantorIdBackImage) {
      data.guarantorIdBackImage = (await this.storage.uploadFile(files.guarantorIdBackImage, "inquiries")).url;
    }
    if (files.guarantorSignatureImage) {
      data.guarantorSignatureImage = (await this.storage.uploadFile(files.guarantorSignatureImage, "inquiries")).url;
    }

    return this.prisma.inquiry.create({
      data,
      include: { motorcycle: { include: { brand: true } }, user: true },
    });
  }

  async sendWhatsApp(id: string, _actor: AuthenticatedUser) {
    const inquiry = await this.prisma.inquiry.findUnique({
      where: { id },
      include: { motorcycle: { include: { brand: true } }, financingCompany: true },
    });
    if (!inquiry) throw new NotFoundException("Inquiry not found");
    if (!inquiry.motorcycleId || !inquiry.motorcycle) throw new BadRequestException("Motorcycle is required");
    if (!inquiry.financingCompanyId || !inquiry.financingCompany) throw new BadRequestException("Financing company is required");
    if (!inquiry.idCardFrontImage || !inquiry.idCardBackImage) throw new BadRequestException("ID card images are required");

    const body = `*استعلام جديد*\n\nالعميل: ${inquiry.customerName}\nالهاتف: ${inquiry.customerPhone}\nالدراجة: ${inquiry.motorcycle.brand.nameAr} ${inquiry.motorcycle.model}\n${inquiry.downPayment ? `الدفعة المقدمة: ${inquiry.downPayment}\n` : ""}شركة التمويل: ${inquiry.financingCompany.name}\n`;
    const customer = await this.prisma.customer.upsert({
      where: { phone: inquiry.customerPhone },
      create: { name: inquiry.customerName, phone: inquiry.customerPhone },
      update: { name: inquiry.customerName },
      select: { id: true },
    });
    const sent = await this.notifications.sendDirectWhatsApp({
      customerId: customer.id,
      recipient: inquiry.financingCompany.whatsappNumber,
      body,
      attachments: [inquiry.idCardFrontImage, inquiry.idCardBackImage],
    });

    const duration = inquiry.installmentDurationId
      ? await this.prisma.installmentDuration.findFirst({ where: { id: inquiry.installmentDurationId, isActive: true } })
      : await this.prisma.installmentDuration.findFirst({ where: { isActive: true }, orderBy: { months: "asc" } });
    if (!duration) throw new BadRequestException("No installment duration is configured");
    const motorcyclePrice = Number(inquiry.motorcycle.price);
    const downPayment = Number(inquiry.downPayment ?? 0);
    const requestData = {
      customerId: customer.id,
      motorcycleId: inquiry.motorcycleId,
      financingCompanyId: inquiry.financingCompanyId,
      installmentDurationId: duration.id,
      status: "pending" as const,
      buyerName: inquiry.customerName,
      buyerPhone: inquiry.customerPhone,
      buyerAddress: inquiry.address,
      buyerOccupation: inquiry.occupation,
      buyerNationalIdImage: inquiry.idCardFrontImage,
      buyerNationalIdBackImage: inquiry.idCardBackImage,
      salarySlipImage: inquiry.documentImage,
      apartmentContractImage: null,
      guarantorName: null,
      guarantorPhone: null,
      guarantorNationalIdImage: inquiry.guarantorIdFrontImage,
      guarantorNationalIdBackImage: inquiry.guarantorIdBackImage,
      guarantorSignatureImage: inquiry.guarantorSignatureImage,
      motorcyclePrice: inquiry.motorcycle.price,
      downPayment,
      monthlyInstallment: Math.max(0, (motorcyclePrice - downPayment) / duration.months),
    };
    await this.prisma.installmentRequest.upsert({
      where: { inquiryId: inquiry.id },
      create: { inquiryId: inquiry.id, ...requestData },
      update: requestData,
    });
    return sent;
  }

  async sendForReview(id: string, _actor: AuthenticatedUser) {
    const inquiry = await this.prisma.inquiry.findUnique({
      where: { id },
      include: { motorcycle: true, financingCompany: true, installmentDuration: true },
    });
    if (!inquiry) throw new NotFoundException("Inquiry not found");
    if (!inquiry.motorcycleId || !inquiry.motorcycle) throw new BadRequestException("Motorcycle is required");
    if (!inquiry.financingCompanyId || !inquiry.financingCompany) throw new BadRequestException("Financing company is required");
    if (!inquiry.installmentDurationId || !inquiry.installmentDuration) throw new BadRequestException("Installment duration is required");
    if (!inquiry.idCardFrontImage || !inquiry.idCardBackImage) throw new BadRequestException("ID card images are required");

    const customer = await this.prisma.customer.upsert({
      where: { phone: inquiry.customerPhone },
      create: { name: inquiry.customerName, phone: inquiry.customerPhone },
      update: { name: inquiry.customerName },
      select: { id: true },
    });
    const motorcyclePrice = Number(inquiry.motorcycle.price);
    const downPayment = Number(inquiry.downPayment ?? 0);
    const requestData = {
      customerId: customer.id,
      motorcycleId: inquiry.motorcycleId,
      financingCompanyId: inquiry.financingCompanyId,
      installmentDurationId: inquiry.installmentDurationId,
      status: "pending" as const,
      buyerName: inquiry.customerName,
      buyerPhone: inquiry.customerPhone,
      buyerAddress: inquiry.address,
      buyerOccupation: inquiry.occupation,
      buyerNationalIdImage: inquiry.idCardFrontImage,
      buyerNationalIdBackImage: inquiry.idCardBackImage,
      salarySlipImage: inquiry.documentImage,
      apartmentContractImage: null,
      guarantorName: null,
      guarantorPhone: null,
      guarantorNationalIdImage: inquiry.guarantorIdFrontImage,
      guarantorNationalIdBackImage: inquiry.guarantorIdBackImage,
      guarantorSignatureImage: inquiry.guarantorSignatureImage,
      motorcyclePrice: inquiry.motorcycle.price,
      downPayment,
      monthlyInstallment: Math.max(0, (motorcyclePrice - downPayment) / inquiry.installmentDuration.months),
    };
    return this.prisma.installmentRequest.upsert({
      where: { inquiryId: inquiry.id },
      create: { inquiryId: inquiry.id, ...requestData },
      update: requestData,
      include: { customer: true, motorcycle: { include: { brand: true } }, financingCompany: true, duration: true },
    });
  }
}
