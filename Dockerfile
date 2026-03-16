# Build stage
FROM node:20-slim AS build

WORKDIR /app

# Vertex AI build args — no API key needed, auth is via IAM at runtime
ARG USE_VERTEX=true
ARG VERTEX_PROJECT
ARG VERTEX_LOCATION=us-central1

ENV USE_VERTEX=$USE_VERTEX
ENV VERTEX_PROJECT=$VERTEX_PROJECT
ENV VERTEX_LOCATION=$VERTEX_LOCATION

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the application (Vertex config baked in by vite.config.ts)
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Copy the built files from the build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
COPY --from=build /app/server.js ./

# Install only production dependencies
RUN npm install --omit=dev

# Cloud Run will override PORT at runtime
EXPOSE 3000

CMD ["node", "server.js"]
