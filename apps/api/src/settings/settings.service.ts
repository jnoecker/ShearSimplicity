import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { EventType } from "@shearsimp/shared";
import type { SalonSettingsUpdateInput } from "@shearsimp/shared";
import { PrismaService } from "../prisma/prisma.service";
import { appendDomainEvent } from "../common/domain-events";

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(salonId: string) {
    const salon = await this.prisma.salon.findUnique({
      where: { id: salonId },
      select: {
        id: true,
        slug: true,
        name: true,
        timezone: true,
        smsFromNumber: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!salon) throw new NotFoundException("Salon not found");
    return salon;
  }

  async update(
    salonId: string,
    actorUserId: string,
    input: SalonSettingsUpdateInput,
  ) {
    const data: Prisma.SalonUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.timezone !== undefined) data.timezone = input.timezone;
    if (input.smsFromNumber !== undefined) {
      data.smsFromNumber = input.smsFromNumber;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const salon = await tx.salon.update({
          where: { id: salonId },
          data,
          select: {
            id: true,
            slug: true,
            name: true,
            timezone: true,
            smsFromNumber: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        await appendDomainEvent(tx, {
          salonId,
          aggregateType: "SALON",
          aggregateId: salonId,
          eventType: EventType.SALON_UPDATED,
          payload: {
            changes: input,
            after: {
              name: salon.name,
              timezone: salon.timezone,
              smsFromNumber: salon.smsFromNumber,
            },
          },
          actorUserId,
        });
        return salon;
      });
    } catch (e) {
      // smsFromNumber is unique across all salons (Twilio routes inbound by
      // To, so two salons can't share). Map the constraint violation to a
      // 409 with a field-scoped error message instead of letting Nest serve
      // a generic 500.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        const target = (e.meta as { target?: string[] | string } | undefined)
          ?.target;
        const hitsSmsFromNumber = Array.isArray(target)
          ? target.includes("smsFromNumber")
          : target === "smsFromNumber" ||
            target === "salons_smsFromNumber_key";
        if (hitsSmsFromNumber) {
          // Shape matches the Zod-style payload the web's ApiError.fieldMessages()
          // already parses, so the form can surface the conflict at the
          // smsFromNumber field instead of as a generic top-of-form error.
          throw new ConflictException({
            message: "Another salon already uses that SMS sender number",
            issues: [
              {
                path: "smsFromNumber",
                message: "Already claimed by another salon",
              },
            ],
          });
        }
      }
      throw e;
    }
  }
}
