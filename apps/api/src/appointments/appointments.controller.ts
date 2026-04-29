import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  appointmentCancelSchema,
  appointmentCompleteSchema,
  appointmentCreateSchema,
  appointmentListQuerySchema,
  appointmentNotesUpdateSchema,
  appointmentRescheduleSchema,
  appointmentTransitionSchema,
} from "@shearsimp/shared";
import type {
  AppointmentCancelInput,
  AppointmentCompleteInput,
  AppointmentCreateInput,
  AppointmentListQueryInput,
  AppointmentNotesUpdateInput,
  AppointmentRescheduleInput,
  AppointmentTransitionInput,
} from "@shearsimp/shared";
import { CurrentSalon } from "../tenant/current-salon.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type {
  ActiveSalon,
  AuthIdentity,
} from "../context/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AppointmentsService } from "./appointments.service";

@Controller("appointments")
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  list(
    @CurrentSalon() salon: ActiveSalon,
    @Query(new ZodValidationPipe(appointmentListQuerySchema))
    query: AppointmentListQueryInput,
  ) {
    return this.appointments.list(salon.salonId, query);
  }

  @Get(":id")
  get(
    @CurrentSalon() salon: ActiveSalon,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.appointments.get(salon.salonId, id);
  }

  @Post()
  create(
    @CurrentSalon() salon: ActiveSalon,
    @CurrentUser() user: AuthIdentity,
    @Body(new ZodValidationPipe(appointmentCreateSchema))
    input: AppointmentCreateInput,
  ) {
    return this.appointments.create(salon.salonId, user.userId, input);
  }

  @Post(":id/reschedule")
  reschedule(
    @CurrentSalon() salon: ActiveSalon,
    @CurrentUser() user: AuthIdentity,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(appointmentRescheduleSchema))
    input: AppointmentRescheduleInput,
  ) {
    return this.appointments.reschedule(salon.salonId, user.userId, id, input);
  }

  @Post(":id/cancel")
  cancel(
    @CurrentSalon() salon: ActiveSalon,
    @CurrentUser() user: AuthIdentity,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(appointmentCancelSchema))
    input: AppointmentCancelInput,
  ) {
    return this.appointments.cancel(salon.salonId, user.userId, id, input);
  }

  @Post(":id/transition")
  transition(
    @CurrentSalon() salon: ActiveSalon,
    @CurrentUser() user: AuthIdentity,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(appointmentTransitionSchema))
    input: AppointmentTransitionInput,
  ) {
    return this.appointments.transition(
      salon.salonId,
      user.userId,
      id,
      input.status,
    );
  }

  @Post(":id/complete")
  complete(
    @CurrentSalon() salon: ActiveSalon,
    @CurrentUser() user: AuthIdentity,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(appointmentCompleteSchema))
    input: AppointmentCompleteInput,
  ) {
    return this.appointments.complete(salon.salonId, user.userId, id, input);
  }

  @Patch(":id/notes")
  updateNotes(
    @CurrentSalon() salon: ActiveSalon,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(appointmentNotesUpdateSchema))
    input: AppointmentNotesUpdateInput,
  ) {
    return this.appointments.updateNotes(salon.salonId, id, input);
  }
}
