import { Body, Controller, Post } from "@nestjs/common";
import { checkoutCreateSchema } from "@shearsimp/shared";
import type { CheckoutCreateInput } from "@shearsimp/shared";
import { CurrentSalon } from "../tenant/current-salon.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type {
  ActiveSalon,
  AuthIdentity,
} from "../context/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PaymentsService } from "./payments.service";

@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // POST /payments/checkout: returns a Stripe Checkout Session URL the
  // caller redirects the user to. The webhook (5a) finalises status when
  // Stripe calls us back; the UI just needs to follow the URL.
  @Post("checkout")
  async createCheckout(
    @CurrentSalon() salon: ActiveSalon,
    @CurrentUser() user: AuthIdentity,
    @Body(new ZodValidationPipe(checkoutCreateSchema))
    input: CheckoutCreateInput,
  ): Promise<{ url: string; paymentId: string }> {
    return this.payments.createCheckoutForAppointment(
      salon.salonId,
      user.userId,
      input,
    );
  }
}
