import { Module } from "@nestjs/common";
import { PosInstallmentsController } from "./pos-installments.controller.js";
import { PosInstallmentsService } from "./pos-installments.service.js";

@Module({
  controllers: [PosInstallmentsController],
  providers: [PosInstallmentsService],
})
export class PosInstallmentsModule {}
