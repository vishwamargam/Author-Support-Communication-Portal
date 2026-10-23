FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/src ./src
COPY FULLSTACK-SAMPLEDATA.json ./FULLSTACK-SAMPLEDATA.json

EXPOSE 4000
USER node
CMD ["npm", "start"]
