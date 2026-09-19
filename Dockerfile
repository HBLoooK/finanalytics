# Runs Finanalytics as a single self-contained container.
#   docker build -t finanalytics .
#   docker run -p 8787:8787 -v finanalytics-data:/app/data finanalytics
#
# Set FINANALYTICS_TOKEN to require a token (automatic whenever HOST is not loopback).
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV HOST=0.0.0.0
ENV FINANALYTICS_DB=/app/data/finanalytics.db

COPY package*.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY dist ./dist
COPY public ./public

VOLUME ["/app/data"]
EXPOSE 8787

CMD ["node", "server/index.mjs"]
