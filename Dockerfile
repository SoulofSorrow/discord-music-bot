FROM node:22-alpine

RUN apk add --no-cache yt-dlp ffmpeg

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

VOLUME ["/app/data"]

CMD ["node", "src/index.js"]
