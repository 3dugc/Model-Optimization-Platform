FROM node:20-alpine

WORKDIR /app

COPY apps/worker/package.json ./package.json
COPY apps/worker/src ./src

ENV NODE_ENV=production
ENV WORKER_CONCURRENCY=1

CMD ["npm", "start"]
