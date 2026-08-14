FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY encoder-v118.mjs /app/encoder.mjs

ENV NODE_ENV=production \
    PORT=8080

EXPOSE 8080
CMD ["node", "/app/encoder.mjs"]
