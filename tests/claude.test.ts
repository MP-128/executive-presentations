import path from "node:path";
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { ClaudeLlm, MODEL } from "../server/claude.ts";
import { DeckSpec, ProjectInputs, type Plan } from "../shared/contract.ts";

const skillDir = path.resolve(import.meta.dirname, "../skill");
const inputs = ProjectInputs.parse({ companyName: "Acme", topic: "Support pilot", storyline: "Backlog doubled\nRecommend a pilot" });

/** Fake SDK client: records each request and replays canned responses in order. No network. */
function fakeClient(replies: object[]) {
  const requests: Record<string, unknown>[] = [];
  const client = { beta: { messages: { stream: (params: Record<string, unknown>) => {
    requests.push(JSON.parse(JSON.stringify(params)));
    return { finalMessage: async () => replies.shift() };
  } } } };
  return { client: client as unknown as Anthropic, requests };
}

const reply = (fields: object) => ({ model: MODEL, stop_reason: "end_turn", content: [], ...fields });
const textReply = (text: string) => reply({ content: [{ type: "text", text }] });

const slide = { title: "Backlog doubled since 2024", takeaway: "", points: ["[add metric]"], pattern: "bullets", visual: "Key points",
  sources: [], evidence: "user-provided", assumptions: [], origin: "user" };
const deck: DeckSpec = { title: "Support pilot", slides: [{ pattern: "cover", title: "Run a support pilot" }, { pattern: "bullets", title: "Backlog doubled", points: ["[add metric]"] }] };

describe("ClaudeLlm", () => {
  it("builds the plan from structured output and records the serving model", async () => {
    const { client, requests } = fakeClient([reply({ parsed_output: { storyline: "Pilot first.", slides: [slide] } })]);
    const plan = await new ClaudeLlm(skillDir, client).proposePlan(inputs);
    expect(plan).toMatchObject({ storyline: "Pilot first.", generatedBy: MODEL, slides: [{ title: slide.title, origin: "user" }] });
    const req = requests[0];
    expect(req.model).toBe(MODEL);
    expect(req.fallbacks).toBe("default");
    expect(JSON.stringify(req.system)).toContain("Never invent facts");
    expect(JSON.stringify(req.messages)).toContain("Backlog doubled");
  });

  it("rejects plan output that fails the schema", async () => {
    const { client } = fakeClient([reply({ parsed_output: { storyline: "x", slides: [] } })]);
    await expect(new ClaudeLlm(skillDir, client).proposePlan(inputs)).rejects.toThrow(/expected format/);
  });

  it("sends schema errors back once and accepts the corrected deck JSON", async () => {
    const { client, requests } = fakeClient([textReply('{"title": "x", "slides": []}'), textReply("```json\n" + JSON.stringify(deck) + "\n```")]);
    const plan: Plan = { storyline: "s", slides: [slide as Plan["slides"][number]], generatedBy: MODEL };
    expect(await new ClaudeLlm(skillDir, client).writeDeckSpec(plan, inputs)).toEqual(deck);
    const retry = requests[1].messages as { role: string; content: unknown }[];
    expect(retry.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(String(retry[2].content)).toMatch(/does not match the schema/);
  });

  it("fails the job with a readable error on a second bad reply or a refusal", async () => {
    const plan: Plan = { storyline: "s", slides: [slide as Plan["slides"][number]], generatedBy: MODEL };
    const bad = fakeClient([textReply("not json"), textReply("still not json")]);
    await expect(new ClaudeLlm(skillDir, bad.client).writeDeckSpec(plan, inputs)).rejects.toThrow(/did not match the deck format/);
    const refused = fakeClient([reply({ stop_reason: "refusal" })]);
    await expect(new ClaudeLlm(skillDir, refused.client).proposePlan(inputs)).rejects.toThrow(/declined/);
  });
});
