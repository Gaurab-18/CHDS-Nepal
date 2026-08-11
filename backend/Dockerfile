FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

# Run as non-root: the backend only needs to write to the uploads volume.
RUN mkdir -p /usr/src/app/uploads && chown -R node:node /usr/src/app
USER node

EXPOSE 4000

CMD ["npm", "start"]