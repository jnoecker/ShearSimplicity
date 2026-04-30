import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import {
  appointmentSeriesCancelSchema,
  appointmentSeriesCreateSchema,
  appointmentSeriesExtendSchema,
} from "@shearsimp/shared";
import type {
  AppointmentSeriesCancelInput,
  AppointmentSeriesCreateInput,
  AppointmentSeriesExtendInput,
} from "@shearsimp/shared";
import { CurrentSalon } from "../tenant/current-salon.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type {
  ActiveSalon,
  AuthIdentity,
} from "../context/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AppointmentSeriesService } from "./series.service";

@Controller("appointment-series")
export class AppointmentSeriesController {
  constructor(private readonly series: AppointmentSeriesService) {}

  @Get(":id")
  get(
    @CurrentSalon() salon: ActiveSalon,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.series.get(salon.salonId, id);
  }

  @Post()
  create(
    @CurrentSalon() salon: ActiveSalon,
    @CurrentUser() user: AuthIdentity,
    @Body(new ZodValidationPipe(appointmentSeriesCreateSchema))
    input: AppointmentSeriesCreateInput,
  ) {
    return this.series.create(salon.salonId, user.userId, input);
  }

  @Post(":id/cancel")
  cancel(
    @CurrentSalon() salon: ActiveSalon,
    @CurrentUser() user: AuthIdentity,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(appointmentSeriesCancelSchema))
    input: AppointmentSeriesCancelInput,
  ) {
    return this.series.cancelSeries(salon.salonId, user.userId, id, input);
  }

  @Post(":id/extend")
  extend(
    @CurrentSalon() salon: ActiveSalon,
    @CurrentUser() user: AuthIdentity,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(appointmentSeriesExtendSchema))
    input: AppointmentSeriesExtendInput,
  ) {
    return this.series.extend(salon.salonId, user.userId, id, input);
  }

  // No body — the action is unambiguous. Idempotent: if the series is
  // already indefinite the service returns the current state.
  @Post(":id/convert-to-indefinite")
  convertToIndefinite(
    @CurrentSalon() salon: ActiveSalon,
    @CurrentUser() user: AuthIdentity,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.series.convertToIndefinite(salon.salonId, user.userId, id);
  }
}
