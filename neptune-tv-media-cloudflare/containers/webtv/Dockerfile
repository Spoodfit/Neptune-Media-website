FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY encoder-v118.mjs /app/encoder.mjs
COPY encoder-smoothness-v124.mjs /tmp/encoder-smoothness-v124.mjs
RUN node /tmp/encoder-smoothness-v124.mjs \
  && rm /tmp/encoder-smoothness-v124.mjs

ENV NODE_ENV=production \
    PORT=8080

EXPOSE 8080
CMD ["node", "/app/encoder.mjs"]
