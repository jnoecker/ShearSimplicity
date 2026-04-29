import { Module, forwardRef } from "@nestjs/common";
import { AppointmentsModule } from "../appointments/appointments.module";
import { OutboxWorker } from "./outbox.worker";

// forwardRef defends against a future cycle: today AppointmentsModule
// doesn't import OutboxModule, but exporting AppointmentSeriesService for
// the worker's dispatch is the kind of boundary that quietly grows into one.
@Module({
  imports: [forwardRef(() => AppointmentsModule)],
  providers: [OutboxWorker],
  exports: [OutboxWorker],
})
export class OutboxModule {}
