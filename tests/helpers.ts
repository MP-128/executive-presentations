import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import JSZip from "jszip";
import type { Response } from "superagent";
import { loadConfig, type Config } from "../server/config.ts";
import { openDb } from "../server/db.ts";
import { StubLlm, type Llm } from "../server/llm.ts";
import { Worker } from "../server/worker.ts";
import { createApp } from "../server/app.ts";

export function setup(opts: { llm?: Llm; cfg?: Partial<Config> } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ep-test-"));
  const cfg = loadConfig({ dataDir, render: false, ...opts.cfg });
  const db = openDb(dataDir);
  const worker = new Worker(db, cfg, opts.llm ?? new StubLlm());
  const api = request(createApp({ db, cfg, worker }));
  return { api, worker, db, cfg, dataDir };
}

/** supertest parser that keeps binary bodies as a Buffer. */
export const binary = (res: Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

export async function slideCount(pptx: Buffer) {
  const zip = await JSZip.loadAsync(pptx);
  return Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).length;
}

export async function themeXml(pptx: Buffer) {
  return (await JSZip.loadAsync(pptx)).file("ppt/theme/theme1.xml")!.async("string");
}

export const sofficeAvailable = ["/opt/homebrew/bin/soffice", "/usr/bin/soffice", "/Applications/LibreOffice.app/Contents/MacOS/soffice"]
  .some((p) => fs.existsSync(p));
