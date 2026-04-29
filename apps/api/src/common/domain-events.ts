import {
  type AggregateType as AggregateTypeEnum,
  ActorType,
  type Prisma,
} from "@prisma/client";

interface AppendDomainEventArgs {
  salonId: string | null;
  aggregateType: AggregateTypeEnum;
  aggregateId: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
  actorUserId?: string | null;
}

/**
 * Append a `domain_events` row inside an active Prisma transaction. Always
 * invoke this from within `prisma.$transaction(async (tx) => …)` so the row
 * commits atomically with the business write that produced it — that's the
 * append-only contract Phase 1 set up.
 */
export async function appendDomainEvent(
  tx: Prisma.TransactionClient,
  {
    salonId,
    aggregateType,
    aggregateId,
    eventType,
    payload,
    actorUserId,
  }: AppendDomainEventArgs,
): Promise<void> {
  await tx.domainEvent.create({
    data: {
      salonId,
      aggregateType,
      aggregateId,
      eventType,
      payload,
      actorType: actorUserId ? ActorType.USER : ActorType.SYSTEM,
      actorId: actorUserId ?? null,
    },
  });
}
