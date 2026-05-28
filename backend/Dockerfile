FROM node:22-alpine
RUN apk upgrade --no-cache
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY src/ src/
EXPOSE 3001
CMD ["node", "src/index.js"]
