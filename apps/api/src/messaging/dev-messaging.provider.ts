import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { env } from "../env";
import type {
  MessagingProvider,
  SendSmsArgs,
  SendSmsResult,
  ValidateInboundArgs,
} from "./messaging-provider.interface";

/**
 * Local-development messaging provider. Logs every outbound SMS to the API log
 * and returns a synthetic sid prefixed `dev_` so it never collides with a
 * real Twilio sid (`SM...`).
 *
 * Inbound signature validation is a no-op — local testing simulates Twilio
 * webhooks via curl, which can't sign with the production auth token. Refuses
 * to run when NODE_ENV=production so this can't accidentally ship.
 */
@Injectable()
export class DevMessagingProvider implements MessagingProvider {
  private readonly logger = new Logger(DevMessagingProvider.name);

  async sendSms(args: SendSmsArgs): Promise<SendSmsResult> {
    if (env.NODE_ENV === "production") {
      throw new Error("DevMessagingProvider must not run in production");
    }
    const sid = `dev_${randomUUID()}`;
    this.logger.log(
      `[dev-sms] from=${args.from} to=${args.to} sid=${sid} body=${JSON.stringify(args.body)}`,
    );
    return { providerMessageId: sid, status: "SENT" };
  }

  validateInboundSignature(_args: ValidateInboundArgs): boolean {
    if (env.NODE_ENV === "production") {
      throw new Error("DevMessagingProvider must not run in production");
    }
    return true;
  }
}
