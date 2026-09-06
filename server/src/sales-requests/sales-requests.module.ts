import { Module } from "@nestjs/common";
import { SalesRequestsController } from "./sales-requests.controller.js";
import { SalesRequestsService } from "./sales-requests.service.js";

@Module({
  controllers: [SalesRequestsController],
  providers: [SalesRequestsService],
})
export class SalesRequestsModule {}
