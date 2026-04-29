import { Body, Controller, Get, Patch } from "@nestjs/common";
import { salonSettingsUpdateSchema } from "@shearsimp/shared";
import type { SalonSettingsUpdateInput } from "@shearsimp/shared";
import { CurrentSalon } from "../tenant/current-salon.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type {
  ActiveSalon,
  AuthIdentity,
} from "../context/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SettingsService } from "./settings.service";

@Controller("settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(@CurrentSalon() salon: ActiveSalon) {
    return this.settings.get(salon.salonId);
  }

  @Patch()
  update(
    @CurrentSalon() salon: ActiveSalon,
    @CurrentUser() user: AuthIdentity,
    @Body(new ZodValidationPipe(salonSettingsUpdateSchema))
    input: SalonSettingsUpdateInput,
  ) {
    return this.settings.update(salon.salonId, user.userId, input);
  }
}
