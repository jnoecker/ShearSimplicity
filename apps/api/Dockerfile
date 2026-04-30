# syntax=docker/dockerfile:1.7
#
# Image for both the Nest HTTP API service and the outbox worker service.
# On Railway both services run this image; the API service sets
# OUTBOX_WORKER_DISABLED=true, the worker leaves it unset.

FROM node:22-slim AS base
# node:22-slim matches Prisma's default `debian-openssl-3.0.x` binary target,
# so packages/db/prisma/schema.prisma needs no binaryTargets entry. The query
# engine still links against libssl at runtime — install it explicitly because
# the slim image doesn't ship with it.
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo


FROM base AS build
# Lockfile + workspace manifests first, so `pnpm install` is cached on the
# lockfile alone and only re-runs when dependencies actually change.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --prefer-offline

# Source for everything the API needs (web is excluded).
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/api apps/api

# Generate the Prisma client (writes into node_modules/.prisma) and build
# the workspace in dependency order: shared → db → api.
RUN pnpm --filter @shearsimp/db exec prisma generate \
 && pnpm --filter @shearsimp/shared build \
 && pnpm --filter @shearsimp/db build \
 && pnpm --filter @shearsimp/api build


FROM base AS runtime
ENV NODE_ENV=production
# Copy the entire built workspace. pnpm uses symlinks for workspace packages
# (apps/api/node_modules/@shearsimp/db → ../../packages/db); copying the tree
# as a single unit preserves them. The image is larger than a hand-pruned
# variant but the tradeoff isn't worth the maintenance cost at this stage.
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
EXPOSE 3001
CMD ["node", "dist/main.js"]
