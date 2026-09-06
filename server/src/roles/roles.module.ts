import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { RolesController } from "./roles.controller.js";
import { RolesService } from "./roles.service.js";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
