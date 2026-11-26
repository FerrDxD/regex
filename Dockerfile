FROM node:20-alpine

WORKDIR /app

# Install production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Build TypeScript server + Vite client (if needed)
RUN npx tsc -p tsconfig.server.json

# Expose signaling port
ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/server/signaling-server.js"]
