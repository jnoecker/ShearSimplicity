import { Module } from "@nestjs/common";
import { ClerkWebhookController } from "./clerk-webhook.controller";
import { ClerkWebhookService } from "./clerk-webhook.service";
import { TwilioWebhookController } from "./twilio-webhook.controller";

@Module({
  controllers: [ClerkWebhookController, TwilioWebhookController],
  providers: [ClerkWebhookService],
})
export class WebhooksModule {}
