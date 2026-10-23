import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { binary, setup, slideCount } from "./helpers.ts";
import { findLogoCandidates } from "../server/logos.ts";

// Labelled sample logo, not a real company's.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><rect width="300" height="100" fill="#0067B1"/><rect x="20" y="20" width="60" height="60" fill="#FFFFFF"/></svg>`;
const base = { companyName: "Sample Co (labelled sample)", objective: "Decide whether to pilot an AI support assistant" };

function upload(t: ReturnType<typeof setup>, body: string | Buffer, type = "image/svg+xml") {
  return t.api.post("/api/uploads/logo").set("Content-Type", type).send(Buffer.from(body));
}

async function generate(t: ReturnType<typeof setup>, inputs: object) {
  const { body: { projectId } } = await t.api.post("/api/projects").send(inputs).expect(201);
  await t.api.post(`/api/projects/${projectId}/plan`).expect(202);
  await t.worker.tick();
  await t.api.post(`/api/projects/${projectId}/plans/1/approve`).expect(200);
  const { body: { jobId } } = await t.api.post(`/api/projects/${projectId}/generate`).send({ planVersion: 1 }).expect(202);
  await t.worker.tick();
  const { body: job } = await t.api.get(`/api/jobs/${jobId}`).expect(200);
  expect(job).toMatchObject({ status: "succeeded", error: null });
  const res = await t.api.get(`/api/jobs/${jobId}/files/deck.pptx`).buffer(true).parse(binary).expect(200);
  return { job, pptx: res.body as Buffer, brand: JSON.parse(fs.readFileSync(path.join(t.dataDir, "jobs", jobId, "brand.json"), "utf8")) };
}

/** Picture names per slide, from slide XML. */
async function pictures(pptx: Buffer) {
  const zip = await JSZip.loadAsync(pptx);
  const n = await slideCount(pptx);
  const out: string[][] = [];
  for (let i = 1; i <= n; i++) {
    const xml = await zip.file(`ppt/slides/slide${i}.xml`)!.async("string");
    out.push([...xml.matchAll(/<p:pic>.*?name="([^"]+)"/gs)].map((m) => m[1]));
  }
  return out;
}

describe("logo upload", () => {
  it("stores an SVG as PNG with its size, and serves it back", async () => {
    const t = setup();
    const { body: logo } = await upload(t, SVG).expect(201);
    expect(logo).toMatchObject({ width: 1200, height: 400, sourceUrl: null, label: "Uploaded by you" });
    const img = await t.api.get(`/api/uploads/${logo.id}`).expect(200);
    expect(img.headers["content-type"]).toBe("image/png");
  });

  it("rejects files that aren't PNG, JPEG or SVG, and oversized files", async () => {
    const t = setup();
    const bad = await upload(t, "GIF89a not a logo", "image/gif").expect(400);
    expect(bad.body.error).toMatch(/PNG, JPEG or SVG/);
    const big = await upload(t, Buffer.alloc(2 * 1024 * 1024 + 10), "image/png").expect(413);
    expect(big.body.error).toMatch(/2 MB/);
  });

  it("refuses a project that points at a logo the server doesn't have", async () => {
    const t = setup();
    const res = await t.api.post("/api/projects").send({ ...base, logos: { subject: "missing", placement: "title" } }).expect(404);
    expect(res.body.error).toMatch(/Logo not found/);
  });
});

describe("logo placement in the generated deck", () => {
  it("title only: logos on the cover, none elsewhere", async () => {
    const t = setup();
    const { body: subject } = await upload(t, SVG).expect(201);
    const { body: presenting } = await upload(t, SVG).expect(201);
    const { pptx, brand } = await generate(t, {
      ...base, presentingCompany: { include: true, name: "Sample Advisors" },
      logos: { subject: subject.id, presenting: presenting.id, placement: "title" },
    });
    expect(brand.logos).toMatchObject({ placement: "title", subject: { aspect: 3 }, presenting: { aspect: 3 } });
    const pics = await pictures(pptx);
    expect(pics[0]).toEqual(["Logo (subject)", "Logo (presenting)"]);
    expect(pics.slice(1).flat()).toEqual([]);
  });

  it("title and closing: adds a closing slide that carries the logo", async () => {
    const t = setup();
    const { body: subject } = await upload(t, SVG).expect(201);
    const plain = await generate(t, base);
    const { pptx } = await generate(t, { ...base, logos: { subject: subject.id, placement: "titleAndClosing" } });
    const pics = await pictures(pptx);
    expect(pics.length).toBe((await slideCount(plain.pptx)) + 1);
    expect(pics.at(-1)).toEqual(["Logo (subject)"]);
  });

  it("footer: a small logo on the content layout, so every content slide shows it", async () => {
    const t = setup();
    const { body: subject } = await upload(t, SVG).expect(201);
    const { pptx } = await generate(t, { ...base, logos: { subject: subject.id, placement: "footer" } });
    const zip = await JSZip.loadAsync(pptx);
    const layouts = await Promise.all(Object.keys(zip.files).filter((f) => /slideLayouts\/slideLayout\d+\.xml$/.test(f)).map((f) => zip.file(f)!.async("string")));
    expect(layouts.filter((x) => x.includes("<p:pic>")).length).toBe(1);
  });

  it("drops my company's logo when my company's branding is turned off", async () => {
    const t = setup();
    const { body: presenting } = await upload(t, SVG).expect(201);
    const { pptx, brand } = await generate(t, { ...base, presentingCompany: { include: false }, logos: { presenting: presenting.id, placement: "title" } });
    expect(brand.logos).toBeUndefined();
    expect((await pictures(pptx)).flat()).toEqual([]);
  });
});

describe("logo retrieval", () => {
  it("ranks structured data, marked images and icons above the social image", () => {
    const html = `<html><head>
      <meta property="og:image" content="/share.jpg">
      <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
      <script type="application/ld+json">{"@type":"Organization","logo":{"@type":"ImageObject","url":"https://cdn.example.com/brand/logo.svg"}}</script>
      </head><body>
      <img alt="Aerial view of a street where the crosswalks form a shape imitating the company logo" src="/photo.jpg">
      <img alt="Example Logo" srcset="/logo-640.png 640w, /logo-1920.png 1920w">
      <img class="site-logo" src="/header-logo.svg?v=1&amp;x=2">
      </body></html>`;
    const found = findLogoCandidates(html, new URL("https://www.example.com/"));
    expect(found.map((c) => c.url)).toEqual([
      "https://cdn.example.com/brand/logo.svg",
      "https://www.example.com/logo-1920.png",
      "https://www.example.com/header-logo.svg?v=1&x=2",
      "https://www.example.com/apple-touch-icon.png",
      "https://www.example.com/share.jpg",
    ]);
  });

  it("won't fetch addresses on the server's own network", async () => {
    const t = setup();
    for (const website of ["http://127.0.0.1:3001", "http://localhost", "http://169.254.169.254/latest/meta-data"]) {
      const res = await t.api.post("/api/brand/lookup").send({ website }).expect(502);
      expect(res.body.error).toMatch(/not a public address/);
    }
  });
});
