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
import { clientCreateSchema, clientUpdateSchema } from "@shearsimp/shared";
import type {
  ClientCreateInput,
  ClientUpdateInput,
} from "@shearsimp/shared";
import { CurrentSalon } from "../tenant/current-salon.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type {
  ActiveSalon,
  AuthIdentity,
} from "../context/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ClientsService } from "./clients.service";

@Controller("clients")
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  list(
    @CurrentSalon() salon: ActiveSalon,
    @Query("q") q?: string,
  ) {
    return this.clients.list(salon.salonId, q);
  }

  @Get(":id")
  get(
    @CurrentSalon() salon: ActiveSalon,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.clients.get(salon.salonId, id);
  }

  @Post()
  create(
    @CurrentSalon() salon: ActiveSalon,
    @CurrentUser() user: AuthIdentity,
    @Body(new ZodValidationPipe(clientCreateSchema)) input: ClientCreateInput,
  ) {
    return this.clients.create(salon.salonId, user.userId, input);
  }

  @Patch(":id")
  update(
    @CurrentSalon() salon: ActiveSalon,
    @CurrentUser() user: AuthIdentity,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(clientUpdateSchema)) input: ClientUpdateInput,
  ) {
    return this.clients.update(salon.salonId, user.userId, id, input);
  }
}
