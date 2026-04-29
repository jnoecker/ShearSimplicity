import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from "@nestjs/common";
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

// Hard cap on a single /payments lookup. The schedule view sends all
// the day's appointments in one request — 500 covers a 10-stylist salon
// pegged at every-15min-slot bookings, and refusing larger lists with
// a 400 (rather than silently truncating) means callers know to batch
// instead of losing rows from the response.
const MAX_LOOKUP_IDS = 500;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // GET /payments?appointmentIds=id1,id2,...: list payment rows for a set
  // of appointments in the current salon. Validates each id is a UUID up
  // front (a non-UUID slipping into the Prisma `in` filter would surface
  // as a 500 from Postgres) and 400s on over-limit input rather than
  // silently dropping rows.
  @Get()
  async list(
    @CurrentSalon() salon: ActiveSalon,
    @Query("appointmentIds") appointmentIds?: string,
  ) {
    if (!appointmentIds) return [];
    const ids = appointmentIds
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (ids.length > MAX_LOOKUP_IDS) {
      throw new BadRequestException(
        `appointmentIds: at most ${MAX_LOOKUP_IDS} per request (got ${ids.length}); batch if you need more`,
      );
    }
    const invalid = ids.find((id) => !UUID_RE.test(id));
    if (invalid) {
      throw new BadRequestException(
        `appointmentIds: "${invalid}" is not a valid UUID`,
      );
    }
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
