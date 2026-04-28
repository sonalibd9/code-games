# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package manifest and install all deps (including devDeps for tsc)
COPY package.json ./
COPY .npmrc ./
RUN npm install && rm -f .npmrc

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app

# Only copy production deps
COPY package.json ./
COPY .npmrc ./
RUN npm install --omit=dev && rm -f .npmrc

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Create uploads directory (Azure App Service uses ephemeral disk;
# for production persistence, replace with Azure Blob Storage)
RUN mkdir -p uploads

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "dist/index.js"]
