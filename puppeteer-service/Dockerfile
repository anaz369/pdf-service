FROM node:20-slim

# Install Chromium and Arabic/Noto fonts
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-noto \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Refresh font cache
RUN fc-cache -f -v

# Tell puppeteer-core to use system Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY index.js ./

RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser

EXPOSE 3001

CMD ["node", "index.js"]
