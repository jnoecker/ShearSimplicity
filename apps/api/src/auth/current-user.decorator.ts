import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import type { AuthIdentity } from "../context/request-context";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthIdentity => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.identity) {
      throw new UnauthorizedException("No authenticated identity on request");
    }
    return req.identity;
  },
);
