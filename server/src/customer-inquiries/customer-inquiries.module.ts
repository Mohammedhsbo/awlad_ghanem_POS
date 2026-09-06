import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { UploadModule } from "../upload/upload.module.js";
import { CustomerInquiriesController } from "./customer-inquiries.controller.js";
import { CustomerInquiriesService } from "./customer-inquiries.service.js";

@Module({
  imports: [PrismaModule, AuditModule, NotificationsModule, UploadModule],
  controllers: [CustomerInquiriesController],
  providers: [CustomerInquiriesService],
})
export class CustomerInquiriesModule {}