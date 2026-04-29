import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import {
  staffCreateSchema,
  staffUpdateSchema,
  workingHoursReplaceSchema,
} from "@shearsimp/shared";
import type {
  StaffCreateInput,
  StaffUpdateInput,
  WorkingHoursReplaceInput,
} from "@shearsimp/shared";
import { CurrentSalon } from "../tenant/current-salon.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type {
  ActiveSalon,
  AuthIdentity,
} from "../context/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { StaffService } from "./staff.service";

@Controller("staff")
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  list(@CurrentSalon() salon: ActiveSalon) {
    return this.staff.list(salon.salonId);
  }

  @Get(":id")
  get(
    @CurrentSalon() salon: ActiveSalon,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.staff.get(salon.salonId, id);
  }

  @Post()
  create(
    @CurrentSalon() salon: ActiveSalon,
    @CurrentUser() user: AuthIdentity,
    @Body(new ZodValidationPipe(staffCreateSchema)) input: StaffCreateInput,
  ) {
    return this.staff.create(salon.salonId, user.userId, input);
  }

  @Patch(":id")
  update(
    @CurrentSalon() salon: ActiveSalon,
    @CurrentUser() user: AuthIdentity,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(staffUpdateSchema)) input: StaffUpdateInput,
  ) {
    return this.staff.update(salon.salonId, user.userId, id, input);
  }

  @Put(":id/working-hours")
  replaceWorkingHours(
    @CurrentSalon() salon: ActiveSalon,
    @CurrentUser() user: AuthIdentity,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(workingHoursReplaceSchema))
    input: WorkingHoursReplaceInput,
  ) {
    return this.staff.replaceWorkingHours(
      salon.salonId,
      user.userId,
      id,
      input,
    );
  }
}
