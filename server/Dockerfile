FROM node:18-alpine

WORKDIR /usr/src/app

# Install build dependencies for sqlite3 native compilation
RUN apk add --no-cache python3 make g++

COPY package*.json ./

RUN npm install --production

COPY . .

EXPOSE 3000

VOLUME [ "/usr/src/app/data" ]
ENV DATABASE_FILE=/usr/src/app/data/mi_unlock.db

CMD [ "npm", "start" ]
