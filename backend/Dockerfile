FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY backend ./backend

ENV NODE_ENV=production
ENV PORT=8787

EXPOSE 8787

CMD ["node", "backend/server.js"]
