import { Module } from "@nestjs/common";
import { SalonsController } from "./salons.controller";

@Module({
  controllers: [SalonsController],
})
export class SalonsModule {}
