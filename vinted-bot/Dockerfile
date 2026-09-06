FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends python3 build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY test ./test

ENV NODE_ENV=production
VOLUME ["/app/data"]
CMD ["node", "src/index.js"]
