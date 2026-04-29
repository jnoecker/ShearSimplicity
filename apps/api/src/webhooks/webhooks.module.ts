import { Module } from "@nestjs/common";
import { ClerkWebhookController } from "./clerk-webhook.controller";
import { ClerkWebhookService } from "./clerk-webhook.service";
import { TwilioWebhookController } from "./twilio-webhook.controller";
import { StripeWebhookController } from "./stripe-webhook.controller";
import { StripeWebhookService } from "./stripe-webhook.service";

@Module({
  controllers: [
    ClerkWebhookController,
    TwilioWebhookController,
    StripeWebhookController,
  ],
  providers: [ClerkWebhookService, StripeWebhookService],
})
export class WebhooksModule {}
