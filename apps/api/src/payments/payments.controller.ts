import { Body, Controller, Get, Post, Query } from "@nestjs/common";
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

  // GET /payments?appointmentIds=id1,id2,...: list payment rows for a set
  // of appointments in the current salon. Cap the IDs the caller can ask
  // for so a malicious / mistaken client can't pull the whole table by
  // dumping all UUIDs into one request.
  @Get()
  async list(
    @CurrentSalon() salon: ActiveSalon,
    @Query("appointmentIds") appointmentIds?: string,
  ) {
    if (!appointmentIds) return [];
    const ids = appointmentIds
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 200);
    return this.payments.listForAppointments(salon.salonId, ids);
  }

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
