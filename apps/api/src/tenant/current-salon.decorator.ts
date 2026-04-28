import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import type { Request } from "express";
import type { ActiveSalon } from "../context/request-context";

export const CurrentSalon = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ActiveSalon => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.salon) {
      throw new ForbiddenException("No active salon on request");
    }
    return req.salon;
  },
);
