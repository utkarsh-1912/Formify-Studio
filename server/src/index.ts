import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { createApp } from "./app.js";
import { attachYjsServer } from "./yws.js";
import { processDeliveries } from "./webhooks.js";
import { purgeExpired } from "./retention.js";

const config = loadConfig();
const db = openDb(config.databasePath);
const app = createApp({ config, db });

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Formify server listening on :${info.port}`);
});
const yjs = attachYjsServer(server as any, config, db);

const policy = { allowPrivate: config.allowPrivateWebhooks, allowHttp: config.allowHttpWebhooks };
const deliveryTimer = setInterval(() => {
  processDeliveries({ db, policy }).catch((e) => console.error("webhook worker:", e));
}, 5_000);
const purgeTimer = setInterval(() => {
  try {
    purgeExpired(db);
  } catch (e) {
    console.error("retention purge:", e);
  }
}, 60 * 60 * 1000);

const shutdown = () => {
  clearInterval(deliveryTimer);
  clearInterval(purgeTimer);
  yjs.close();
  server.close(() => {
    db.close();
    process.exit(0);
  });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
