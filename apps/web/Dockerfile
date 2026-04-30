# syntax=docker/dockerfile:1.7
#
# Image for the Next.js admin web app. Uses Next 15's standalone output so the
# runtime image only contains the server bundle Next traced as reachable —
# not the full pnpm workspace.

FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo


FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --prefer-offline

# The web build only needs @shearsimp/shared from the workspace.
COPY packages/shared packages/shared
COPY apps/web apps/web

# Build-time env. Next 15 collects page data during `next build`, which
# evaluates `serverEnv` at module load — so any required vars must be present
# even though the runtime container will set them again. NEXT_PUBLIC_* vars
# are also inlined into the client bundle here, so the real Clerk publishable
# key MUST be passed as a build ARG (Railway: Service → Variables → Build
# Variables). Anything not NEXT_PUBLIC_ can stay as a dummy and be overridden
# at runtime.
ARG AUTH_PROVIDER=clerk
# Clerk validates the publishable key's base64 structure during `next build`,
# so the placeholder must be a parseable test-mode key. This one decodes to
# `clerk.placeholder.lcl.dev$` and is harmless — it doesn't authenticate
# against any real Clerk tenant. Always override at build time in Railway
# (Service → Variables → Build Variables) with the real publishable key.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_Y2xlcmsucGxhY2Vob2xkZXIubGNsLmRldiQ
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV AUTH_PROVIDER=${AUTH_PROVIDER}
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV CLERK_SECRET_KEY=sk_build_placeholder
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @shearsimp/shared build \
 && pnpm --filter @shearsimp/web build


FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

# Next 15 standalone output writes a self-contained server tree at
# apps/web/.next/standalone (with the workspace root preserved). Static
# assets and the public/ dir are not included automatically.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
# public/ doesn't exist today but Next will look for it; create it in the
# build stage if assets land there later.

EXPOSE 3000
# The standalone bundle puts server.js inside the app's own directory.
WORKDIR /app/apps/web
CMD ["node", "server.js"]
