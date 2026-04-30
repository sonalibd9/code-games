# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and install all deps (including devDeps for tsc)
COPY package.json package-lock.json* ./
RUN npm ci --registry https://registry.npmjs.org

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app

# Only copy production deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --registry https://registry.npmjs.org

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Create uploads directory (Azure App Service uses ephemeral disk;
# for production persistence, replace with Azure Blob Storage)
RUN mkdir -p uploads

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "dist/index.js"]
