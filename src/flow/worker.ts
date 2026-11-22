// Web Worker entry. Bundled via `new Worker(new URL("./worker.ts", import.meta.url))`.
import { createFlowWorkerHandler } from "./workerHandler";

const scope = self as any;
const handle = createFlowWorkerHandler((m) => scope.postMessage(m));
scope.onmessage = (e: { data: any }) => handle(e.data);
