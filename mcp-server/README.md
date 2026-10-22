# Local Pulse MCP server

AI-visibility management for multi-location local businesses, exposed as an MCP server (TypeScript, Streamable HTTP) so an owner can just ask Alexa+, or any MCP-capable assistant.

## Tools

| Tool | What it does | Public side effect |
|---|---|---|
| `get_ai_visibility_score` | GEO score for one or all locations, by engine and intent, with AI factual errors validated against Google Business Profile | none |
| `compare_locations` | Rank locations on score, weekly change, unanswered reviews, or AI factual errors | none |
| `list_pending_reviews` | Reviews without a reply, optionally negative only | none |
| `draft_review_reply` | Drafts replies (Bedrock if configured, template otherwise) and **stages** them as a pending action | none |
| `approve_action` | The human-approval gate: executes a staged action only if the owner's exact words are an explicit yes | yes, only here |

Every tool returns `{ speak, next_step, data }`: a voice-ready sentence, one suggested next step, and the full detail for screens.

## Run it

```bash
npm install
npm run build && npm start        # http://localhost:8000/mcp  (health: /ping)
npm run smoke                     # plays the demo conversation against the server
```

Optional Bedrock drafting:

```bash
export AWS_REGION=us-east-1
export BEDROCK_MODEL_ID=<a Claude model id or inference profile enabled in your account>
```

Try it in MCP Inspector: `npx @modelcontextprotocol/inspector` and connect to `http://localhost:8000/mcp` (Streamable HTTP).

## Deploy to Amazon Bedrock AgentCore Runtime

The server already follows the AgentCore MCP contract (stateless Streamable HTTP on `0.0.0.0:8000/mcp`, ARM64 image).

```bash
pip install bedrock-agentcore-starter-toolkit
agentcore configure --entrypoint dist/index.js --protocol MCP   # or point it at the Dockerfile
agentcore launch
```

Then add the runtime's invocation URL as an MCP server in the agent or the Alexa+ add-on. Check the AgentCore docs for the current CLI flags; they change often.

## Swapping mock data for live data

`src/data.ts` is the only mock. Replace `LOCATIONS`, `THIS_WEEK_RESULTS` and `REVIEWS` with calls to the GrowthPro GEO engine and the Google Business Profile API; the tools, scoring and approval gate stay the same. Move `src/approvals.ts` to DynamoDB before running more than one container.

## Layout

```
src/index.ts      server + Streamable HTTP transport
src/tools.ts      the five tools and their spoken answers
src/scoring.ts    GEO scoring (brand queries excluded, training-data-only flag, GBP validation)
src/approvals.ts  human-approval gate
src/drafting.ts   review-reply drafting (Bedrock Converse, template fallback)
src/data.ts       mock owner with four dental clinics
scripts/smoke.ts  end-to-end demo conversation
../skills/voice-briefing/SKILL.md  how the assistant should brief by voice
```
