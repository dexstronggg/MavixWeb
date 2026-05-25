FROM node:20-alpine

WORKDIR /app

# Зависимости — отдельным слоем, чтобы кэшировались при правках кода.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Само приложение.
COPY server.js ./
COPY public/ ./public/

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "server.js"]
