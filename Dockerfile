# EasyPanel: build dari root repo. Satu image = web + scheduler pengingat WA (jalan di dalam server Next).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate \
 && DATABASE_URL=postgresql://build:build@localhost:5432/build SESSION_SECRET=build-time-secret-build-time-secret-00 npm run build

FROM node:22-bookworm-slim AS proddeps
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tzdata && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 TZ=Asia/Jakarta NEXT_TELEMETRY_DISABLED=1
# node_modules lengkap (prod) supaya `prisma migrate deploy` dan `tsx prisma/seed.ts` bisa jalan di container
COPY --from=proddeps /app/node_modules ./node_modules
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts /app/package.json ./
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# 1) migrasi DB  2) admin awal + katalog (idempoten)  3) server
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts && node server.js"]
