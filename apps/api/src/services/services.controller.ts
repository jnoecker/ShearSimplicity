import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import {
  serviceCategoryCreateSchema,
  serviceCategoryUpdateSchema,
  serviceCreateSchema,
  serviceUpdateSchema,
} from "@shearsimp/shared";
import type {
  ServiceCategoryCreateInput,
  ServiceCategoryUpdateInput,
  ServiceCreateInput,
  ServiceUpdateInput,
} from "@shearsimp/shared";
import { CurrentSalon } from "../tenant/current-salon.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type {
  ActiveSalon,
  AuthIdentity,
} from "../context/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ServicesService } from "./services.service";

@Controller()
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  // ─── Categories ────────────────────────────────────────────────────────────

  @Get("service-categories")
  listCategories(@CurrentSalon() salon: ActiveSalon) {
    return this.services.listCategories(salon.salonId);
  }

  @Post("service-categories")
  createCategory(
    @CurrentSalon() salon: ActiveSalon,
    @CurrentUser() user: AuthIdentity,
    @Body(new ZodValidationPipe(serviceCategoryCreateSchema))
    input: ServiceCategoryCreateInput,
  ) {
    return this.services.createCategory(salon.salonId, user.userId, input);
  }

  @Patch("service-categories/:id")
  updateCategory(
    @CurrentSalon() salon: ActiveSalon,
    @CurrentUser() user: AuthIdentity,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(serviceCategoryUpdateSchema))
    input: ServiceCategoryUpdateInput,
  ) {
    return this.services.updateCategory(
      salon.salonId,
      user.userId,
      id,
      input,
    );
  }

  // ─── Services ──────────────────────────────────────────────────────────────

  @Get("services")
  list(@CurrentSalon() salon: ActiveSalon) {
    return this.services.list(salon.salonId);
  }

  @Get("services/:id")
  get(
    @CurrentSalon() salon: ActiveSalon,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.services.get(salon.salonId, id);
  }

  @Post("services")
  create(
    @CurrentSalon() salon: ActiveSalon,
    @CurrentUser() user: AuthIdentity,
    @Body(new ZodValidationPipe(serviceCreateSchema)) input: ServiceCreateInput,
  ) {
    return this.services.create(salon.salonId, user.userId, input);
  }

  @Patch("services/:id")
  update(
    @CurrentSalon() salon: ActiveSalon,
    @CurrentUser() user: AuthIdentity,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(serviceUpdateSchema)) input: ServiceUpdateInput,
  ) {
    return this.services.update(salon.salonId, user.userId, id, input);
  }
}
