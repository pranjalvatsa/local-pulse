// Local Pulse MCP server (Streamable HTTP, stateless).
// Matches the Amazon Bedrock AgentCore Runtime MCP contract: 0.0.0.0:8000, POST /mcp.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { Request, Response } from "express";
import { registerTools } from "./tools.js";
import { prewarmDrafts } from "./drafting.js";
import { LOCATIONS, REVIEWS } from "./data.js";

function buildServer() {
  const server = new McpServer(
    { name: "local-pulse", version: "0.1.0" },
    {
      instructions:
        "Local Pulse manages how a multi-location local business shows up in AI answer engines. " +
        "Answers are for voice: speak the `speak` field, offer the `next_step`, never read tables aloud. " +
        "Anything public (review replies, listing changes) must go through approve_action with the owner's own words.",
    },
  );
  registerTools(server);
  return server;
}

const app = createMcpExpressApp({ host: "0.0.0.0" });

app.post("/mcp", async (req: Request, res: Response) => {
  // Stateless: a fresh server + transport per request. Approval state lives in a shared store.
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
  }
});

const notAllowed = (_req: Request, res: Response) =>
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
app.get("/mcp", notAllowed);
app.delete("/mcp", notAllowed);
app.get("/ping", (_req: Request, res: Response) => res.json({ status: "healthy" }));

const port = Number(process.env.PORT ?? 8000);
app.listen(port, "0.0.0.0", () => {
  console.log(`Local Pulse MCP listening on http://0.0.0.0:${port}/mcp`);
  // Draft replies for open reviews in the background so draft_review_reply stays fast.
  prewarmDrafts(REVIEWS.filter((r) => !r.replied).map((review) => ({
    review,
    loc: LOCATIONS.find((l) => l.id === review.locationId)!,
    tone: review.rating <= 3 ? "apologetic" as const : "warm" as const,
  })));
});
