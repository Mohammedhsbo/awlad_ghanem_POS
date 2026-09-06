import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { BrandsController } from "./brands.controller.js";
import { BrandsService } from "./brands.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { AuditModule } from "../audit/audit.module.js";

@Module({
  imports: [AuthModule, PrismaModule, AuditModule],
  controllers: [BrandsController],
  providers: [BrandsService],
})
export class BrandsModule {}