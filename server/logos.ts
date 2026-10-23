// Logo upload, retrieval and storage (blueprint §C). Retrieved logos are only candidates for the user to
// confirm; nothing here puts a logo on a deck. Files are stored as PNG/JPEG under DATA_DIR/uploads.
import fs from "node:fs";
import path from "node:path";
import dns from "node:dns/promises";
import net from "node:net";
import { createHash, randomUUID } from "node:crypto";
import { Resvg } from "@resvg/resvg-js";
import { imageSize } from "image-size";
import { now, type DB } from "./db.ts";
import { HttpError } from "./store.ts";
import type { BrandLookup, LogoAsset, ProjectInputs } from "../shared/contract.ts";

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_PAGE_BYTES = 3 * 1024 * 1024;
const MAX_FETCHED = 8; // candidate images downloaded per lookup
const MIN_SIDE = 64; // anything smaller is a favicon, too blurry for a slide
const UA = "Mozilla/5.0 (compatible; ExecutivePresentations/1.0; logo lookup)";

interface Image { data: Buffer; mime: "image/png" | "image/jpeg"; width: number; height: number }

interface LogoRow { id: string; path: string; mime: string; width: number; height: number; source_url: string | null; label: string }

/** Check a PNG, JPEG or SVG by its content and rasterise SVG to PNG. */
export function normalizeImage(data: Buffer): Image {
  if (data.length > MAX_LOGO_BYTES) throw new HttpError(413, "Logo must be 2 MB or smaller");
  const png = data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (png || jpeg) {
    const { width, height } = imageSize(data);
    if (!width || !height) throw new HttpError(400, "Could not read the image size");
    return { data, mime: png ? "image/png" : "image/jpeg", width, height };
  }
  if (/<svg[\s>]/i.test(data.toString("utf8"))) {
    try {
      const out = new Resvg(data, { fitTo: { mode: "width", value: 1200 } }).render();
      return { data: out.asPng(), mime: "image/png", width: out.width, height: out.height };
    } catch {
      throw new HttpError(400, "Could not read that SVG file");
    }
  }
  throw new HttpError(400, "Logos must be PNG, JPEG or SVG");
}

export function saveLogo(db: DB, dataDir: string, img: Image, meta: { sourceUrl: string | null; label: string }): LogoAsset {
  const id = randomUUID();
  const rel = path.join("uploads", `${id}.${img.mime === "image/png" ? "png" : "jpg"}`);
  fs.mkdirSync(path.join(dataDir, "uploads"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, rel), img.data);
  db.prepare("INSERT INTO uploads (id, kind, path, mime, bytes, width, height, source_url, label, created_at) VALUES (?, 'logo', ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, rel, img.mime, img.data.length, img.width, img.height, meta.sourceUrl, meta.label, now());
  return { id, width: img.width, height: img.height, sourceUrl: meta.sourceUrl, label: meta.label };
}

export function getLogo(db: DB, dataDir: string, id: string) {
  const row = db.prepare("SELECT * FROM uploads WHERE id = ? AND kind = 'logo'").get(id) as LogoRow | undefined;
  if (!row) throw new HttpError(404, "Logo not found; upload or choose it again");
  return { ...row, abs: path.join(dataDir, row.path) };
}

/** Rejects inputs that point at logos the server doesn't have. */
export function assertLogosExist(db: DB, dataDir: string, inputs: ProjectInputs) {
  for (const id of [inputs.logos.subject, inputs.logos.presenting]) if (id) getLogo(db, dataDir, id);
}

/** Fetch the homepage, find logo candidates and store the usable ones for the user to choose from. */
export async function lookupBrand(db: DB, dataDir: string, website: string): Promise<BrandLookup> {
  let page;
  try {
    page = await fetchCapped(website, "text/html,application/xhtml+xml", MAX_PAGE_BYTES);
  } catch (err) {
    throw new HttpError(502, `Couldn't load ${website}: ${message(err)}`);
  }
  const html = page.data.toString("utf8");
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1];
  const found = findLogoCandidates(html, page.url).slice(0, MAX_FETCHED);

  const fetched = await Promise.all(found.map(async (c) => {
    try {
      const img = normalizeImage((await fetchCapped(c.url, "image/svg+xml,image/png,image/jpeg;q=0.9", MAX_LOGO_BYTES)).data);
      if (Math.max(img.width, img.height) < MIN_SIDE) return { c, error: `too small (${img.width}×${img.height}px)` };
      return { c, img };
    } catch (err) {
      return { c, error: message(err) };
    }
  }));

  const candidates: LogoAsset[] = [], skipped: string[] = [], seen = new Set<string>();
  for (const r of fetched) {
    if (!r.img) { skipped.push(`${r.c.url}: ${r.error}`); continue; }
    const hash = createHash("sha1").update(r.img.data).digest("hex");
    if (seen.has(hash)) continue; // the same file linked twice, e.g. header and footer
    seen.add(hash);
    candidates.push(saveLogo(db, dataDir, r.img, { sourceUrl: r.c.url, label: r.c.label }));
  }
  return { website: page.url.href, pageTitle: title ? decodeEntities(title).trim() : null, candidates, skipped };
}

/** Logo candidates in order of how likely they are to be the real logo. */
export function findLogoCandidates(html: string, base: URL): { url: string; label: string }[] {
  const out: { url: string; label: string }[] = [];
  const add = (raw: string | undefined, label: string) => {
    const s = raw && decodeEntities(raw.trim());
    if (!s || s.startsWith("data:")) return;
    try {
      const href = new URL(s, base).href;
      if (!out.some((c) => c.url === href)) out.push({ url: href, label });
    } catch { /* not a URL */ }
  };

  // 1. schema.org Organization.logo
  for (const m of html.matchAll(/"logo"\s*:\s*(?:"([^"]+)"|\{[^{}]*?"(?:url|contentUrl)"\s*:\s*"([^"]+)")/gi)) {
    add(m[1] ?? m[2], "Logo declared in the site's structured data");
  }
  // 2. <img> marked as a logo (a long alt is usually a photo description that mentions the logo)
  for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
    const a = attrs(tag);
    const marked = ["class", "id", "src", "data-component-name"].some((k) => /logo/i.test(a[k] ?? ""))
      || (/logo/i.test(a.alt ?? "") && (a.alt ?? "").length <= 40);
    if (marked) add(a.src && !a.src.startsWith("data:") ? a.src : largestSrcset(a.srcset), "Image marked as a logo on the homepage");
  }
  // 3. site icons (square marks, not wordmarks): an SVG icon, and only the largest touch icon
  let touch: { href: string; size: number } | undefined;
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(tag), rel = (a.rel ?? "").toLowerCase();
    if (rel.split(/\s+/).includes("icon") && /svg/i.test(`${a.type ?? ""} ${a.href ?? ""}`)) add(a.href, "Site icon");
    const size = parseInt(a.sizes ?? "180", 10) || 180;
    if (rel.includes("apple-touch-icon") && a.href && size > (touch?.size ?? 0)) touch = { href: a.href, size };
  }
  add(touch?.href, "Site icon");
  // 4. social sharing image, last because it is often a photo
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(tag);
    if (/^(og:image|twitter:image)$/i.test(a.property ?? a.name ?? "")) add(a.content, "Social sharing image (often not a logo)");
  }
  return out;
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) out[m[1].toLowerCase()] ??= m[2] ?? m[3] ?? m[4];
  return out;
}

function largestSrcset(srcset: string | undefined) {
  if (!srcset) return undefined;
  const entries = decodeEntities(srcset).split(/,\s+/).map((e) => {
    const [url, size = "1x"] = e.trim().split(/\s+/);
    return { url, n: parseFloat(size) || 1 };
  });
  return entries.sort((a, b) => b.n - a.n)[0]?.url;
}

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** GET with a size cap and timeout, following redirects only to public addresses. */
async function fetchCapped(start: string, accept: string, maxBytes: number) {
  let url = new URL(start);
  for (let hop = 0; hop < 5; hop++) {
    await assertPublicHost(url);
    const res = await fetch(url, { redirect: "manual", headers: { "User-Agent": UA, Accept: accept }, signal: AbortSignal.timeout(10_000) });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    if (Number(res.headers.get("content-length") ?? 0) > maxBytes) throw new Error("file is too large");
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of res.body) {
      total += chunk.length;
      if (total > maxBytes) throw new Error("file is too large");
      chunks.push(Buffer.from(chunk));
    }
    return { url, data: Buffer.concat(chunks) };
  }
  throw new Error("too many redirects");
}

/** The server must not be usable to reach its own network (SSRF). */
async function assertPublicHost(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("only http and https addresses can be fetched");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (addrs.some(isPrivate)) throw new Error(`${host} is not a public address`);
}

function isPrivate(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivate(v.slice(7));
    return v === "::1" || v === "::" || /^(fc|fd|fe8|fe9|fea|feb)/.test(v);
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

function message(err: unknown) {
  if (err instanceof Error && err.name === "TimeoutError") return "timed out";
  return err instanceof Error ? err.message : String(err);
}
