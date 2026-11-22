# Build context must be the REPO ROOT (the server shares src/utils/formifySchema.ts with the app):
#   docker build -f server/Dockerfile -t formify-server .
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
# ajv is resolved from /app/node_modules by the shared schema module.
RUN npm init -y >/dev/null && npm install --omit=dev ajv@^8
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY src/utils/formifySchema.ts ./src/utils/formifySchema.ts
COPY server/package.json ./server/package.json
COPY server/src ./server/src
RUN mkdir -p /data && chown -R node:node /data /app
USER node
WORKDIR /app/server
ENV DATABASE_PATH=/data/formify.db PORT=8787
EXPOSE 8787
VOLUME /data
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "src/index.ts"]
