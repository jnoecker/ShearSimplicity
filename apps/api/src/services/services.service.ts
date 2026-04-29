import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { EventType } from "@shearsimp/shared";
import type {
  ServiceCategoryCreateInput,
  ServiceCategoryUpdateInput,
  ServiceCreateInput,
  ServiceUpdateInput,
} from "@shearsimp/shared";
import { PrismaService } from "../prisma/prisma.service";
import { appendDomainEvent } from "../common/domain-events";

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Categories ────────────────────────────────────────────────────────────

  listCategories(salonId: string) {
    return this.prisma.serviceCategory.findMany({
      where: { salonId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

  async createCategory(
    salonId: string,
    actorUserId: string,
    input: ServiceCategoryCreateInput,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const category = await tx.serviceCategory.create({
          data: {
            salonId,
            name: input.name,
            sortOrder: input.sortOrder ?? 0,
          },
        });
        await appendDomainEvent(tx, {
          salonId,
          aggregateType: "SERVICE",
          aggregateId: category.id,
          eventType: EventType.SERVICE_CATEGORY_CREATED,
          payload: { id: category.id, name: category.name },
          actorUserId,
        });
        return category;
      });
    } catch (e) {
      throw mapKnownErrors(e, "Service category");
    }
  }

  async updateCategory(
    salonId: string,
    actorUserId: string,
    id: string,
    input: ServiceCategoryUpdateInput,
  ) {
    const existing = await this.prisma.serviceCategory.findFirst({
      where: { id, salonId },
    });
    if (!existing) throw new NotFoundException("Service category not found");

    try {
      return await this.prisma.$transaction(async (tx) => {
        const category = await tx.serviceCategory.update({
          where: { id },
          data: {
            name: input.name,
            sortOrder: input.sortOrder,
          },
        });
        await appendDomainEvent(tx, {
          salonId,
          aggregateType: "SERVICE",
          aggregateId: category.id,
          eventType: EventType.SERVICE_CATEGORY_UPDATED,
          payload: { changes: input },
          actorUserId,
        });
        return category;
      });
    } catch (e) {
      throw mapKnownErrors(e, "Service category");
    }
  }

  // ─── Services ──────────────────────────────────────────────────────────────

  list(salonId: string) {
    return this.prisma.service.findMany({
      where: { salonId },
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
  }

  async get(salonId: string, id: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, salonId },
      include: { category: { select: { id: true, name: true } } },
    });
    if (!service) throw new NotFoundException("Service not found");
    return service;
  }

  async create(
    salonId: string,
    actorUserId: string,
    input: ServiceCreateInput,
  ) {
    if (input.categoryId) {
      await this.assertCategoryBelongsToSalon(salonId, input.categoryId);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const service = await tx.service.create({
          data: {
            salonId,
            name: input.name,
            slug: input.slug,
            categoryId: input.categoryId ?? null,
            description: input.description ?? null,
            defaultDurationMinutes: input.defaultDurationMinutes,
            defaultPriceCents: input.defaultPriceCents,
            currency: input.currency ?? "USD",
            isActive: input.isActive ?? true,
          },
        });
        await appendDomainEvent(tx, {
          salonId,
          aggregateType: "SERVICE",
          aggregateId: service.id,
          eventType: EventType.SERVICE_CREATED,
          payload: serviceSnapshot(service),
          actorUserId,
        });
        return service;
      });
    } catch (e) {
      throw mapKnownErrors(e, "Service");
    }
  }

  async update(
    salonId: string,
    actorUserId: string,
    id: string,
    input: ServiceUpdateInput,
  ) {
    await this.get(salonId, id);
    if (input.categoryId) {
      await this.assertCategoryBelongsToSalon(salonId, input.categoryId);
    }

    const data: Prisma.ServiceUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.description !== undefined) data.description = input.description;
    if (input.defaultDurationMinutes !== undefined)
      data.defaultDurationMinutes = input.defaultDurationMinutes;
    if (input.defaultPriceCents !== undefined)
      data.defaultPriceCents = input.defaultPriceCents;
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.categoryId !== undefined) {
      // The Service.category relation uses a composite FK (categoryId, salonId)
      // so Prisma exposes the connect target via the named composite-unique
      // key, not the scalar `categoryId`. The presalon-check above plus this
      // composite key make a cross-tenant id impossible.
      data.category = input.categoryId
        ? {
            connect: {
              service_categories_id_salonId_key: {
                id: input.categoryId,
                salonId,
              },
            },
          }
        : { disconnect: true };
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const service = await tx.service.update({ where: { id }, data });
        await appendDomainEvent(tx, {
          salonId,
          aggregateType: "SERVICE",
          aggregateId: service.id,
          eventType: EventType.SERVICE_UPDATED,
          payload: { changes: input, after: serviceSnapshot(service) },
          actorUserId,
        });
        return service;
      });
    } catch (e) {
      throw mapKnownErrors(e, "Service");
    }
  }

  private async assertCategoryBelongsToSalon(salonId: string, categoryId: string) {
    const exists = await this.prisma.serviceCategory.findFirst({
      where: { id: categoryId, salonId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException("Service category not found in this salon");
    }
  }
}

function serviceSnapshot(s: {
  id: string;
  name: string;
  slug: string;
  defaultDurationMinutes: number;
  defaultPriceCents: number;
  currency: string;
  isActive: boolean;
  categoryId: string | null;
}) {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    defaultDurationMinutes: s.defaultDurationMinutes,
    defaultPriceCents: s.defaultPriceCents,
    currency: s.currency,
    isActive: s.isActive,
    categoryId: s.categoryId,
  };
}

function mapKnownErrors(e: unknown, label: string): Error {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") {
      return new ConflictException(`${label} already exists for this salon`);
    }
    if (e.code === "P2025") {
      return new NotFoundException(`${label} not found`);
    }
  }
  return e as Error;
}
