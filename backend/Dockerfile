FROM node:18-alpine

WORKDIR /app

COPY backend/package*.json ./

RUN npm ci --production

COPY backend ./

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "src/index.js"]
