import { SetMetadata } from "@nestjs/common";

export const SKIP_TENANT_KEY = "tenant:skip";

/**
 * Skip the global TenantGuard for this route. Use for endpoints that
 * authenticate a user but do not yet have an active salon (e.g., listing
 * the user's salons before they pick one).
 *
 * Does NOT bypass authentication. For unauthenticated routes use @Public().
 */
export const SkipTenant = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_TENANT_KEY, true);
