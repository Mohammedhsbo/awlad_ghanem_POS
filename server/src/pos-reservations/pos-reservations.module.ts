import { Module } from "@nestjs/common";
import { PosReservationsController } from "./pos-reservations.controller.js";
import { PosReservationsService } from "./pos-reservations.service.js";

@Module({
  controllers: [PosReservationsController],
  providers: [PosReservationsService],
})
export class PosReservationsModule {}
