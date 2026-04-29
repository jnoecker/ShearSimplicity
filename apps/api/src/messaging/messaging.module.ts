import { Global, Module, type Provider } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { env } from "../env";
import { MESSAGING_PROVIDER } from "./messaging-provider.interface";
import { DevMessagingProvider } from "./dev-messaging.provider";
import { TwilioMessagingProvider } from "./twilio-messaging.provider";
import { SmsHandlersService } from "./sms-handlers.service";

// Only the selected provider is constructed. Listing both classes in
// `providers` would have Nest eagerly instantiate them on bootstrap, and
// TwilioMessagingProvider's constructor throws when its env vars are absent
// — which would crash startup in any dev/test env that left the Twilio
// creds unset.
const messagingProviderFactory: Provider = {
  provide: MESSAGING_PROVIDER,
  useFactory: () => {
    switch (env.MESSAGING_PROVIDER) {
      case "dev":
        return new DevMessagingProvider();
      case "twilio":
        return new TwilioMessagingProvider();
    }
  },
};

// Global so the OutboxWorker (in OutboxModule) and the Twilio webhook controller
// (in WebhooksModule) can both inject MESSAGING_PROVIDER + SmsHandlersService
// without re-importing.
@Global()
@Module({
  imports: [PrismaModule],
  providers: [messagingProviderFactory, SmsHandlersService],
  exports: [MESSAGING_PROVIDER, SmsHandlersService],
})
export class MessagingModule {}
