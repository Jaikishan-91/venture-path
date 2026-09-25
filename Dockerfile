# syntax=docker.io/docker/dockerfile:1.11

# Base image with Node.js
FROM node:22-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy package files and install dependencies (schema must be present for postinstall: prisma generate)
COPY package.json package-lock.json* ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci

# Copy the rest of the source
COPY . .
# The repo has no public/ directory; the runner copies it unconditionally.
RUN mkdir -p public
# Regenerate Prisma client (schema was already present during install, but this ensures freshness)
RUN npx prisma generate
RUN npm run build

# Production image, avoid revealing the source code
FROM base AS runner
WORKDIR /app

# Create a non-root user. Stay root until copies and chown finish.
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs --ingroup nodejs

# Copy built output. Prisma 7 emits the client to src/generated/prisma.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
# pino loads this transport by name in a worker, so the standalone trace does not include it.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pino-loki ./node_modules/pino-loki
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pino-abstract-transport ./node_modules/pino-abstract-transport
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pump ./node_modules/pump
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/end-of-stream ./node_modules/end-of-stream
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/once ./node_modules/once
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/split2 ./node_modules/split2
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/real-require ./node_modules/real-require
COPY --from=builder --chown=nextjs:nodejs /app/src/generated/prisma ./src/generated/prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma/schema.prisma ./prisma/schema.prisma

# Cache for HuggingFace transformers model
RUN mkdir -p .cache/models && chown nextjs:nodejs .cache/models
VOLUME ["/app/.cache/models"]

USER nextjs

# Expose the port the app runs on
EXPOSE 3000

# Set environment variables for production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run the app
CMD ["node", "server.js"]
