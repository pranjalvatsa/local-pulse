// End-to-end check: plays the three demo questions against a running server.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(process.env.MCP_URL ?? "http://localhost:8000/mcp");
const client = new Client({ name: "smoke", version: "0.0.1" });
await client.connect(new StreamableHTTPClientTransport(url));

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const t0 = performance.now();
  const res: any = await client.callTool({ name, arguments: args });
  const ms = Math.round(performance.now() - t0);
  const body = res.structuredContent ?? JSON.parse(res.content[0].text);
  console.log(`\n▶ ${name} ${JSON.stringify(args)} (${ms} ms)\n  🔊 ${body.speak}${body.next_step ? "\n  ➜ " + body.next_step : ""}`);
  return body;
};

console.log("tools:", (await client.listTools()).tools.map((t) => t.name).join(", "));
await call("get_ai_visibility_score");
await call("get_ai_visibility_score", { location: "Riverside" });
await call("compare_locations", { metric: "change" });
const pending = await call("list_pending_reviews", { negative_only: true });
const ids = pending.data.reviews.map((r: any) => r.id);
const draft = await call("draft_review_reply", { review_ids: ids });
await call("approve_action", { action_id: draft.data.action_id, owner_utterance: "hmm, what did the second one say?" });
await call("approve_action", { action_id: draft.data.action_id, owner_utterance: "yes, post them" });
await call("list_pending_reviews", { negative_only: true });
await client.close();
