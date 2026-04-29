// Compile-time + runtime parity check between @shearsimp/shared enums
// (the app-level source of truth) and the Prisma-generated enums.
//
// If a future migration drops an enum member from Prisma, or shared adds
// one without updating the schema, this script exits non-zero and fails CI.

import * as Prisma from "@prisma/client";
import {
  Role,
  AppointmentStatus,
  AppointmentSource,
  AppointmentSeriesStatus,
  PaymentStatus,
  MessageDirection,
  MessageStatus,
  OutboxStatus,
  ActorType,
  AggregateType,
  PredictionConfidence,
} from "@shearsimp/shared";

interface ParityCase {
  name: string;
  shared: Record<string, string>;
  prisma: Record<string, string>;
}

const cases: ParityCase[] = [
  { name: "Role", shared: Role, prisma: Prisma.Role },
  {
    name: "AppointmentStatus",
    shared: AppointmentStatus,
    prisma: Prisma.AppointmentStatus,
  },
  {
    name: "AppointmentSource",
    shared: AppointmentSource,
    prisma: Prisma.AppointmentSource,
  },
  {
    name: "AppointmentSeriesStatus",
    shared: AppointmentSeriesStatus,
    prisma: Prisma.AppointmentSeriesStatus,
  },
  { name: "PaymentStatus", shared: PaymentStatus, prisma: Prisma.PaymentStatus },
  {
    name: "MessageDirection",
    shared: MessageDirection,
    prisma: Prisma.MessageDirection,
  },
  { name: "MessageStatus", shared: MessageStatus, prisma: Prisma.MessageStatus },
  { name: "OutboxStatus", shared: OutboxStatus, prisma: Prisma.OutboxStatus },
  { name: "ActorType", shared: ActorType, prisma: Prisma.ActorType },
  { name: "AggregateType", shared: AggregateType, prisma: Prisma.AggregateType },
  {
    name: "PredictionConfidence",
    shared: PredictionConfidence,
    prisma: Prisma.PredictionConfidence,
  },
];

const failures: string[] = [];

for (const { name, shared, prisma } of cases) {
  const sharedValues = new Set(Object.values(shared));
  const prismaValues = new Set(Object.values(prisma));

  for (const v of sharedValues) {
    if (!prismaValues.has(v)) {
      failures.push(`${name}: shared value "${v}" missing from Prisma enum`);
    }
  }
  for (const v of prismaValues) {
    if (!sharedValues.has(v)) {
      failures.push(`${name}: Prisma value "${v}" missing from shared enum`);
    }
  }
}

if (failures.length > 0) {
  // eslint-disable-next-line no-console
  console.error("Enum parity check failed:");
  for (const f of failures) {
    // eslint-disable-next-line no-console
    console.error("  - " + f);
  }
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log(`Enum parity OK across ${cases.length} enums.`);
