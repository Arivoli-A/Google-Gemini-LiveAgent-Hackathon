# Build stage
FROM node:20-slim AS build

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the application
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

# Expose the port the app runs on
# Cloud Run will override this with the PORT environment variable

EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
