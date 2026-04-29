import { Module } from "@nestjs/common";
import { AppointmentsController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";
import { AppointmentSeriesController } from "./series.controller";
import { AppointmentSeriesService } from "./series.service";

@Module({
  controllers: [AppointmentsController, AppointmentSeriesController],
  providers: [AppointmentsService, AppointmentSeriesService],
  exports: [AppointmentSeriesService],
})
export class AppointmentsModule {}
