FROM node:24-alpine

WORKDIR /app

COPY package*.json ./

COPY apps/web/package*.json ./apps/web/
COPY packages/shared/package*.json ./packages/shared/

RUN npm install

COPY . .

RUN npm run build:web

WORKDIR /app/apps/web

EXPOSE 3000

CMD ["npm", "start"]