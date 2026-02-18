# syntax=docker/dockerfile:1

FROM node:22-alpine AS build

WORKDIR /repo
RUN corepack enable

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps/web ./apps/web

RUN pnpm install --frozen-lockfile
RUN pnpm -C packages/core build
RUN pnpm -C apps/web build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Next standalone output (prepare-standalone.mjs places server under apps/web)
COPY --from=build /repo/apps/web/.next/standalone ./

# Runtime config
ENV PORT=3000
EXPOSE 3000

WORKDIR /app/apps/web
CMD ["node", "server.js"]
