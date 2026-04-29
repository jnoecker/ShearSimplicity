import { Global, Module, type Provider } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { env } from "../env";
import { PAYMENT_PROVIDER } from "./payment-provider.interface";
import { DevPaymentProvider } from "./dev-payment.provider";
import { StripePaymentProvider } from "./stripe-payment.provider";
import { PaymentsService } from "./payments.service";
import { PaymentsController } from "./payments.controller";

// Only the selected provider is constructed. Listing both classes in
// `providers` would have Nest eagerly instantiate them on bootstrap, and
// StripePaymentProvider's constructor throws when its env vars are absent
// — which would crash startup in any dev/test env that left the Stripe
// creds unset. (Same pattern as MessagingModule.)
const paymentProviderFactory: Provider = {
  provide: PAYMENT_PROVIDER,
  useFactory: () => {
    switch (env.PAYMENT_PROVIDER) {
      case "dev":
        return new DevPaymentProvider();
      case "stripe":
        return new StripePaymentProvider();
    }
  },
};

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [PaymentsController],
  providers: [paymentProviderFactory, PaymentsService],
  exports: [PAYMENT_PROVIDER, PaymentsService],
})
export class PaymentsModule {}
