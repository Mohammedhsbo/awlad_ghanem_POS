import { Module } from "@nestjs/common";
import { SalesController } from "./sales.controller.js";
import { SalesService } from "./sales.service.js";
import { UploadModule } from "../upload/upload.module.js";

@Module({
  imports: [UploadModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
