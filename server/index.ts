import express from "express";
import path from "node:path";
import { loadConfig } from "./config.ts";
import { openDb } from "./db.ts";
import { StubLlm, type Llm } from "./llm.ts";
import { ClaudeLlm } from "./claude.ts";
import { Worker } from "./worker.ts";
import { createApp } from "./app.ts";

const cfg = loadConfig();
const db = openDb(cfg.dataDir);
// Without a key the labelled placeholder planner runs, so the app stays usable and honest about it.
const llm: Llm = process.env.ANTHROPIC_API_KEY ? new ClaudeLlm(cfg.skillDir) : new StubLlm();
const worker = new Worker(db, cfg, llm);
worker.start();

const port = Number(process.env.PORT ?? 3001);
const app = createApp({ db, cfg, worker });
app.use(express.static(path.resolve(import.meta.dirname, "../client/dist"))); // built React app (npm run build)
app.listen(port, () => {
  console.log(`API on http://localhost:${port} (data: ${cfg.dataDir}, model: ${llm.name})`);
});
