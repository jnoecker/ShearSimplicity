import { SetMetadata } from "@nestjs/common";

export const PUBLIC_KEY = "auth:public";

/** Skip the global AuthGuard (and TenantGuard) for this route. */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PUBLIC_KEY, true);
