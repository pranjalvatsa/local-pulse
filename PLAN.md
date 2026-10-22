# Local Pulse: build plan

## The big change: you can ship into real Alexa+

Amazon now has an **Alexa+ MCP Toolkit**: you register any Streamable HTTP MCP server as an "MCP add-on" with the `alexa-ai` CLI, and test it in the Alexa+ Web Simulator or on a device ([overview](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html), [quickstart](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html)). So the demo doesn't have to *simulate* Alexa+. Lead with the real thing.

Constraints from the quickstart that shape the build:

- Streamable HTTP only, reachable over public HTTPS (use cloudflared while developing).
- **Round trip under 500 ms.** Live multi-LLM scoring and Bedrock drafting can't happen inside a call; they run ahead of time and tools read cached results.
- Auth, if you use it: OAuth 2.1 auth-code + PKCE (S256), RFC 9728 resource metadata, 401 with **no** `WWW-Authenticate` header, no dynamic client registration.
- Alexa+ writes the spoken answer itself from your tool output. Voice rules therefore have to live in the tool results and server `instructions`, not only in SKILL.md.
- Tools are refreshed only on `alexa-ai deploy`.

## Scope (cut for the 24 Oct deadline)

One channel: **Alexa+**. No web app, no Strands agent, no DynamoDB, Lambda or Polly. Data stays mock.

```
Alexa+ (Web Simulator / device)
        │  MCP add-on
        ▼
Local Pulse MCP server (TypeScript, Streamable HTTP, 5 tools, approval gate)
  ├─ Claude on Amazon Bedrock (review-reply drafting, template fallback)
  └─ hosted on AgentCore Runtime if it works, else a cloudflared tunnel
```

## Schedule

**22 Oct (today)**
1. Node 24, AWS IAM user and `alexa-ai` profile, install CLI, `alexa-ai configure`.
2. `npm start`, `cloudflared tunnel --url http://localhost:8000`, `alexa-ai new mcp`, copy the listing values and image URLs into `addon.json`, `alexa-ai deploy`.
3. Ask the demo questions in the Web Simulator and fix what breaks. Screenshot it.
4. Turn on Bedrock drafting (`BEDROCK_MODEL_ID`) and check calls stay under 500 ms.

**23 Oct**
5. Optional: `agentcore launch` and point the add-on at it. Skip if auth is a problem; the tunnel is enough.
6. Record the video (script in `submission/other-fields.md`), upload to YouTube.
7. Add the Simulator screenshot as gallery image 5.

**24 Oct (deadline day)**
8. Fill in the hackathon form: story, tags, repo link, gallery, video. Submit well before the cutoff.
9. `alexa-ai submit` only if the rules need it.

**Risk to check first:** whether Alexa+ accepts a server with no auth. Also whether it accepts an AgentCore URL (JWT inbound auth vs the 401 / no `WWW-Authenticate` rule). If not, stay on the tunnel or App Runner.

## 90-second demo script

1. "How are my four clinics showing up in AI search this week?" → average 56, Downtown leads at 74, Riverside dropped 8.
2. "Why did Riverside drop?" → ChatGPT has the wrong hours for it (validated against Google Business Profile).
3. "Which location has unanswered reviews?" → Riverside three, Northside two, two negative.
4. "Draft replies to the two negative ones." → drafted, asks to post.
5. "Hmm, what did the second one say?" → reads it, **does not post**. Show that the server refused because there was no yes.
6. "Yes, post them." → done.
7. Cut to the 38.75 → 76 client chart as proof the scoring is real.

## Draft text for the bracketed parts of your writeup

Edit to match what you actually ship.

**AWS:** Review drafting runs on Claude in Amazon Bedrock. The MCP server is packaged as an ARM64 container for Amazon Bedrock AgentCore Runtime. (State only what you actually deployed.)

**Extra challenges:**
- *Alexa+'s 500 ms budget.* Multi-model scoring takes minutes and an LLM-drafted reply takes seconds, so we moved both out of the request path: scores are computed on a schedule, drafts are generated when a review arrives, and tools only read results.
- *The assistant writes the answer, not us.* Alexa+ composes the spoken reply from tool output, so every tool returns a ready-to-speak sentence and one next step, and the voice rules are repeated in the server instructions.

**Accomplishments:** a live Alexa+ MCP add-on with five tools, every tool call under 20 ms, and an approval gate the server enforces itself rather than trusting the model to ask.

**What we learned (Alexa+/AWS):** wrapping an existing MCP server as an Alexa+ add-on is a small step once the server speaks Streamable HTTP; the hard part is designing tool output for the ear and the latency budget.

**Feedback for the Amazon team (optional):** ask for a documented way to pass voice-style guidance (like a SKILL.md) to Alexa+ for an add-on, a confirmation primitive for write actions so every developer doesn't build their own gate, and clearer guidance on using AgentCore-hosted servers with the add-on OAuth requirements.
