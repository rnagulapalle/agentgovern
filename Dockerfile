# ---- deps: install dependencies ----
FROM node:22-alpine AS deps
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
# --ignore-scripts: skip optional native build scripts (e.g. sharp) we don't use,
# and avoids pnpm's "ignored builds" hard-fail in CI.
RUN pnpm install --frozen-lockfile --ignore-scripts

# ---- build: compile the Next.js app ----
FROM node:22-alpine AS build
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
# NEXT_PUBLIC_* vars are baked in at build time — pass via build args.
ARG NEXT_PUBLIC_WAITLIST_ENDPOINT=""
ENV NEXT_PUBLIC_WAITLIST_ENDPOINT=$NEXT_PUBLIC_WAITLIST_ENDPOINT
ARG NEXT_PUBLIC_POSTHOG_KEY=""
ARG NEXT_PUBLIC_POSTHOG_HOST="/ph"
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build
RUN node scripts/build-enquiry-worker.mjs

# ---- runner: minimal production image ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
# standalone output bundles only what's needed to run
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/.worker ./.worker
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
