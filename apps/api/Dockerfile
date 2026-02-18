# syntax=docker/dockerfile:1

FROM node:22-alpine AS build

WORKDIR /repo

# Avoid large Playwright browser downloads during image build.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Enable pnpm via corepack
RUN corepack enable

# Copy workspace manifests first for better caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN pnpm install --frozen-lockfile
RUN pnpm -C packages/core build
RUN pnpm -C apps/api build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Keep pnpm virtual store + workspace node_modules so Node can resolve deps.
COPY --from=build /repo/node_modules/.pnpm ./node_modules/.pnpm
COPY --from=build /repo/node_modules/.modules.yaml ./node_modules/.modules.yaml
COPY --from=build /repo/node_modules/.bin ./node_modules/.bin

COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/server.js"]
