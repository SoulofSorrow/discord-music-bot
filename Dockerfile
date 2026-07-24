FROM node:22-alpine

RUN apk add --no-cache yt-dlp ffmpeg

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

VOLUME ["/app/data"]

CMD ["node", "--experimental-sqlite", "src/index.js"]
