FROM node:18-alpine

# Install build dependencies for sharp (native binaries)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files first (layer caching — only re-runs npm install if package.json changes)
COPY package*.json ./
RUN npm install --omit=dev

# Copy app source
COPY . .

# Don't run as root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

CMD ["node", "server.js"]
