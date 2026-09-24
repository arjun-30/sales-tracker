# API server image. Build context is server/.
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
# node_modules keeps the Prisma CLI and tsx so migrations, the seed and the
# location-history purge can run inside this container.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY prisma ./prisma
COPY scripts ./scripts
USER node
EXPOSE 4000
# Apply any pending migrations, then start. migrate deploy never resets data.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
