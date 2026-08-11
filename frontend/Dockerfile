FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

# Run as non-root: Next.js standalone does not need root at runtime.
RUN chown -R node:node /usr/src/app
USER node

EXPOSE 3000

CMD ["npx", "next", "start", "-p", "3000"]