FROM node:24-slim AS base
WORKDIR /app

# Install all workspace dependencies
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY server/package*.json ./server/
COPY client/package*.json ./client/
RUN npm ci

# Build shared types
COPY shared/ ./shared/
RUN npm run build --workspace=shared

# Build frontend (outputs to client/dist/)
COPY client/ ./client/
RUN npm run build --workspace=client

# Build backend
COPY server/ ./server/
RUN npm run build --workspace=server

EXPOSE 8080
ENV NODE_ENV=production
CMD ["node", "server/dist/index.js"]
