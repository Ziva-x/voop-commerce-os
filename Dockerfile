# Multi-stage production build for Next.js unified app
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

# Dependencies
FROM base AS deps
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

# Builder
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN npx prisma generate
RUN npm run build

# Runner
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy built application & node_modules
COPY --from=builder /app ./

EXPOSE 3000

CMD ["sh", "-c", "npx prisma generate && node scripts/pre-migration.js && npx prisma db push --accept-data-loss && node server.js"]
