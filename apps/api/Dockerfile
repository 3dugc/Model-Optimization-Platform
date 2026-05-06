FROM node:20-alpine

WORKDIR /app

COPY apps/api/package.json ./package.json
RUN npm install --omit=dev

COPY apps/api/src ./src

ENV NODE_ENV=production
ENV API_PORT=8080

EXPOSE 8080

CMD ["npm", "start"]
