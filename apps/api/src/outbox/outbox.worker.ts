import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { OutboxStatus, type OutboxEvent } from "@prisma/client";
import { EventType } from "@shearsimp/shared";
import { env } from "../env";
import { PrismaService } from "../prisma/prisma.service";

const POLL_INTERVAL_MS = 5_000;
const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 5;

// Outbox stub for Phase 3a. Phase 4 replaces this with a BullMQ-backed
// processor that actually sends SMS confirmations on `appointment.created`.
//
// The worker exists today so the contract is visible end-to-end: writers
// append OutboxEvent rows in the same transaction as the business write, the
// worker eventually picks them up, the handler decides what to do.
@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (env.OUTBOX_WORKER_DISABLED) {
      this.logger.log("OutboxWorker disabled via OUTBOX_WORKER_DISABLED");
      return;
    }
    this.scheduleNext(0);
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(delayMs: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.tick();
    }, delayMs);
  }

  private async tick() {
    if (this.running) {
      this.scheduleNext(POLL_INTERVAL_MS);
      return;
    }
    this.running = true;
    try {
      await this.processBatch();
    } catch (err) {
      this.logger.error("Outbox tick failed", err as Error);
    } finally {
      this.running = false;
      this.scheduleNext(POLL_INTERVAL_MS);
    }
  }

  // Fetches a small batch of due events and processes them sequentially. We
  // don't claim rows with a status flip + SELECT FOR UPDATE here because there
  // is only one worker process at this stage; Phase 4 introduces BullMQ which
  // handles dispatch and concurrency properly.
  async processBatch() {
    const due = await this.prisma.outboxEvent.findMany({
      where: {
        status: OutboxStatus.PENDING,
        nextAttemptAt: { lte: new Date() },
      },
      orderBy: [{ nextAttemptAt: "asc" }],
      take: BATCH_SIZE,
    });
    for (const event of due) {
      await this.processOne(event);
    }
  }

  private async processOne(event: OutboxEvent) {
    try {
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: OutboxStatus.PROCESSING, attempts: { increment: 1 } },
      });
      await dispatch(event);
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: OutboxStatus.COMPLETED,
          processedAt: new Date(),
          lastError: null,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Outbox event ${event.id} (${event.eventType}) failed: ${message}`,
      );
      const dead = event.attempts + 1 >= MAX_ATTEMPTS;
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: dead ? OutboxStatus.DEAD_LETTER : OutboxStatus.PENDING,
          lastError: message.slice(0, 1000),
          // Linear backoff is fine for a stub; replace with exponential when
          // real handlers go in.
          nextAttemptAt: new Date(
            Date.now() + (event.attempts + 1) * 30_000,
          ),
        },
      });
    }
  }
}

// Handler dispatch table. Phase 4 will replace the appointment.created branch
// with a real SMS send. Until then, every event no-ops successfully so the
// worker exercises the read/update/finalize path end-to-end.
async function dispatch(event: OutboxEvent): Promise<void> {
  switch (event.eventType) {
    case EventType.APPOINTMENT_CREATED:
      // Intentional no-op for Phase 3a.
      return;
    default:
      return;
  }
}
