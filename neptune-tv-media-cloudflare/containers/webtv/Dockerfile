FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY encoder.mjs /app/encoder.mjs
COPY apply-smoothness-patch.mjs /tmp/apply-smoothness-patch.mjs
RUN node /tmp/apply-smoothness-patch.mjs \
  && rm /tmp/apply-smoothness-patch.mjs

ENV NODE_ENV=production \
    PORT=8080

EXPOSE 8080
CMD ["node", "/app/encoder.mjs"]
