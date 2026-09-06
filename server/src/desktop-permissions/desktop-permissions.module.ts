import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { DesktopPermissionsController } from "./desktop-permissions.controller.js";
import { DesktopPermissionsService } from "./desktop-permissions.service.js";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [DesktopPermissionsController],
  providers: [DesktopPermissionsService],
})
export class DesktopPermissionsModule {}
