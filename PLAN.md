# Local Pulse: build plan

## The big change: you can ship into real Alexa+

Amazon now has an **Alexa+ MCP Toolkit**: you register any Streamable HTTP MCP server as an "MCP add-on" with the `alexa-ai` CLI, and test it in the Alexa+ Web Simulator or on a device ([overview](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html), [quickstart](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html)). So the demo doesn't have to *simulate* Alexa+. Lead with the real thing and keep the web app as the second channel.

Constraints from the quickstart that shape the build:

- Streamable HTTP only, reachable over public HTTPS (use cloudflared while developing).
- **Round trip under 500 ms.** Live multi-LLM scoring and Bedrock drafting can't happen inside a call; they run ahead of time and tools read cached results.
- Auth, if you use it: OAuth 2.1 auth-code + PKCE (S256), RFC 9728 resource metadata, 401 with **no** `WWW-Authenticate` header, no dynamic client registration.
- Alexa+ writes the spoken answer itself from your tool output. Voice rules therefore have to live in the tool results and server `instructions`, not only in SKILL.md.
- Tools are refreshed only on `alexa-ai deploy`.

## Recommended stack (fills your two placeholders)

```
          Alexa+ (device / Web Simulator)        Web app (chat + voice)
                     │  MCP add-on                    │  HTTPS
                     │                                ▼
                     │                  Strands agent on AgentCore Runtime
                     │                  (Claude on Amazon Bedrock + SKILL.md)
                     ▼                                │  MCP client
        ┌───────────────────────────────────────────────────────┐
        │ Local Pulse MCP server (TypeScript, Streamable HTTP)  │
        │ AgentCore Runtime · 5 tools · approval gate           │
        └───────────────┬───────────────────────┬───────────────┘
                        │                       │
            GEO scoring results           Pending actions
            (nightly batch → DynamoDB)    (DynamoDB, 15-min TTL)
                        │
     GrowthPro GEO engine (ChatGPT, Gemini, Perplexity) + Google Business Profile
```

| Layer | Pick | Why |
|---|---|---|
| MCP server | TypeScript, `@modelcontextprotocol/sdk`, stateless Streamable HTTP, **Amazon Bedrock AgentCore Runtime** | Done in `mcp-server/`. Already matches AgentCore's MCP contract (0.0.0.0:8000/mcp, ARM64). |
| Reasoning + drafting | **Claude on Amazon Bedrock** (Converse API) | Drafts replies and powers the web agent. Pre-generated so Alexa+ never waits. |
| Web agent | **Strands Agents SDK** (Python) on AgentCore Runtime, with `MCPClient` pointed at the server and SKILL.md as the system prompt | Gives the web app the same brain and tools Alexa+ has. |
| Scoring jobs | EventBridge Scheduler → Lambda that calls the GrowthPro engine, writes to DynamoDB | Keeps the slow multi-model queries out of the voice path. |
| State | DynamoDB (scores, reviews, pending actions with TTL) | Replaces the in-memory stores once there's more than one container. |
| Web front end | Vite + React, browser Web Speech API for speech-to-text, Amazon Polly for the voice, hosted on Amplify Hosting | Fastest path to a convincing voice demo. |

**Risk to check first (day 1):** whether Alexa+ accepts an AgentCore Runtime URL and its inbound JWT auth (Cognito) given the 401/no-`WWW-Authenticate` rule. If it doesn't, run the same container on App Runner or Lambda behind a public HTTPS URL for the Alexa+ path, and keep AgentCore for the Strands agent. The code doesn't change.

## Build order

1. **Now:** run `mcp-server/` locally, expose with `cloudflared tunnel --url http://localhost:8000`, register with `alexa-ai new mcp` and `alexa-ai deploy`, and ask the three demo questions in the Web Simulator. This is the riskiest step, so do it before anything else.
2. Deploy the server to AgentCore Runtime (`agentcore configure` / `agentcore launch`), point the add-on at it, redeploy.
3. Turn on Bedrock drafting (`BEDROCK_MODEL_ID`), confirm drafts are prewarmed and calls stay under 500 ms.
4. Strands agent + web front end.
5. Swap `src/data.ts` for one real GrowthPro client (anonymised) if you have engine access.
6. Record the demo.

## 90-second demo script

1. "How are my four clinics showing up in AI search this week?" → average 56, Downtown leads at 74, Riverside dropped 8.
2. "Why did Riverside drop?" → ChatGPT has the wrong hours for it (validated against Google Business Profile).
3. "Which location has unanswered reviews?" → Riverside three, Northside two, two negative.
4. "Draft replies to the two negative ones." → drafted, asks to post.
5. "Hmm, what did the second one say?" → reads it, **does not post**. Show that the server refused because there was no yes.
6. "Yes, post them." → done.
7. Cut to the web app doing the same conversation, then the 38.75 → 76 client chart as proof the scoring is real.

## Draft text for the bracketed parts of your writeup

Edit to match what you actually ship.

**AWS:** Reasoning and review drafting run on Claude in Amazon Bedrock. The MCP server is hosted on Amazon Bedrock AgentCore Runtime, and the web agent is built with the Strands Agents SDK, also on AgentCore. Scores and pending approvals live in DynamoDB, refreshed by a scheduled Lambda.

**Web app:** a Vite + React app using the browser's speech recognition for input and Amazon Polly for the voice, talking to a Strands agent that uses the same MCP server Alexa+ does.

**Extra challenges:**
- *Alexa+'s 500 ms budget.* Multi-model scoring takes minutes and an LLM-drafted reply takes seconds, so we moved both out of the request path: scores are computed on a schedule, drafts are generated when a review arrives, and tools only read results.
- *The assistant writes the answer, not us.* Alexa+ composes the spoken reply from tool output, so every tool returns a ready-to-speak sentence and one next step, and the voice rules are repeated in the server instructions.

**Accomplishments:** a live Alexa+ MCP add-on with five tools, a working web voice front end, every tool call under 20 ms, and an approval gate the server enforces itself rather than trusting the model to ask.

**What we learned (Alexa+/AWS):** wrapping an existing MCP server as an Alexa+ add-on is a small step once the server speaks Streamable HTTP; the hard part is designing tool output for the ear and the latency budget.

**Feedback for the Amazon team (optional):** ask for a documented way to pass voice-style guidance (like a SKILL.md) to Alexa+ for an add-on, a confirmation primitive for write actions so every developer doesn't build their own gate, and clearer guidance on using AgentCore-hosted servers with the add-on OAuth requirements.

## Questions for you

1. Do you have API access to the GrowthPro GEO engine for the demo, or should the demo stay on mock data?
2. Are you comfortable with a Python Strands agent next to the TypeScript server, or do you want the whole thing in TypeScript?
