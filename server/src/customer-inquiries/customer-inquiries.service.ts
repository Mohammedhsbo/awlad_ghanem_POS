import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageService } from "../upload/storage.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import type { CreateCustomerInquiryDto } from "@motorcycle-system/shared-types";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";

const inquiryInclude = { customer: { select: { id: true, name: true, phone: true } } } as const;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageSize = 5 * 1024 * 1024;

@Injectable()
export class CustomerInquiriesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async create(
    input: CreateCustomerInquiryDto,
    files: { idCardFrontImage?: Express.Multer.File[]; idCardBackImage?: Express.Multer.File[] },
    actor: AuthenticatedUser,
  ) {
    const front = files.idCardFrontImage?.[0];
    const back = files.idCardBackImage?.[0];
    if (!front || !back) throw new BadRequestException("Both ID card images are required");
    for (const image of [front, back]) {
      if (!allowedImageTypes.has(image.mimetype) || image.size > maxImageSize) {
        throw new BadRequestException("ID card images must be JPEG, PNG, or WebP files up to 5 MB");
      }
    }
    const customer = await this.prisma.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw new NotFoundException("Customer not found");
    const [frontUpload, backUpload] = await Promise.all([
      this.storage.uploadFile(front, `customer-inquiries/${input.customerId}`),
      this.storage.uploadFile(back, `customer-inquiries/${input.customerId}`),
    ]);
    return this.prisma.customerInquiry.create({
      data: {
        ...input,
        idCardFrontImage: frontUpload.filename,
        idCardBackImage: backUpload.filename,
        createdBy: actor.id,
      },
      include: inquiryInclude,
    });
  }

  list(_actor: AuthenticatedUser) {
    return this.prisma.customerInquiry.findMany({ orderBy: { createdAt: "desc" }, include: inquiryInclude });
  }

  async get(id: string, _actor: AuthenticatedUser) {
    const inquiry = await this.prisma.customerInquiry.findUnique({ where: { id }, include: inquiryInclude });
    if (!inquiry) throw new NotFoundException("Customer inquiry not found");
    return inquiry;
  }

  async sendWhatsApp(id: string, _actor: AuthenticatedUser) {
    const inquiry = await this.get(id, _actor);
    const body = `اسم العميل / ${inquiry.customer.name}\nالعنوان / ${inquiry.address}\nرقم الهاتف / ${inquiry.phone}\nالمهنة / ${inquiry.occupation}\nعنوان المهنة / ${inquiry.occupationAddress}`;
    return this.notifications.sendDirectWhatsApp({
      customerId: inquiry.customerId,
      recipient: inquiry.customer.phone,
      body,
      attachments: [inquiry.idCardFrontImage, inquiry.idCardBackImage],
    });
  }
}