## Inspiration

People no longer just Google where to eat or which dentist to see. They ask ChatGPT, Gemini, and now voice assistants like Alexa+. Most local businesses have no idea whether AI recommends them, and the owners who need that answer most run several locations and are rarely at a desk.

I run GrowthPro AI, where we measure and improve how local businesses show up in AI answer engines. One client's AI visibility score went from **38.75 to 76 over 17 audit runs**. The insight behind Local Pulse: this shouldn't need a dashboard login. An owner should be able to just ask.

## What it does

Local Pulse is an MCP server that brings AI-visibility management into Alexa+. An owner can ask:

- _"How are my four clinics showing up in AI search this week?"_
- _"Which location has unanswered reviews?"_
- _"Draft replies to the two negative ones."_

The agent answers in a sentence or two, built for voice, and offers one clear next step:

> "Across your four clinics you average 56 out of 100 in AI search. Downtown leads at 74, but Riverside dropped 8 points. Want to hear what's dragging Riverside down?"

It also catches when AI engines get facts wrong. If ChatGPT tells people Riverside is open on Saturdays and the Google Business Profile says it isn't, the owner hears about it.

Anything that goes public, like a review reply or a listing change, requires the owner to say yes first. And "yes" means yes: if the owner answers _"hmm, what did the second one say?"_, nothing gets posted.

## How we built it

- **MCP server (TypeScript, Streamable HTTP):** five tools, `get_ai_visibility_score`, `compare_locations`, `list_pending_reviews`, `draft_review_reply` and `approve_action`, built on the official MCP TypeScript SDK. The server is stateless, so it scales horizontally.
- **Alexa+-ready MCP server:** a self-hosted Streamable HTTP server (MCP spec 2025-11-25) with an add-on manifest ready for the Alexa AI CLI. Tools return voice-ready output because Alexa+ writes the spoken reply itself.
- **Voice-shaped tool output:** every tool returns `{ speak, next_step, data }`: a sentence ready to be spoken, one suggested next step, and the full detail for screens.
- **Scoring engine:** adapted from GrowthPro AI's production GEO engine. It runs distinct-intent queries (discovery, service, brand) across ChatGPT, Gemini and Perplexity and scores a position-weighted mention rate. We exclude direct brand-name queries because they inflate scores, and we flag answers that come from training data alone rather than live sources.

$$\text{score} = 100 \times \frac{1}{|Q|}\sum_{q \in Q} m_q\,(0.6 + 0.4\,w_{p_q}), \quad Q = \text{non-brand queries}$$

  where $m_q$ is 1 if the business is mentioned and $w_{p_q}$ rewards being named first.
- **Entity validation:** factual claims the models make (hours, phone, services, accepting new patients) are checked against Google Business Profile data, so the agent reports facts rather than guesses.
- **Agent Skill:** a `SKILL.md` that teaches the assistant how to brief an owner by voice: short sentences, no tables, rounded numbers, one next step.
- **Human-approval gate:** public actions are staged, never executed directly. `approve_action` takes the owner's exact words and the **server** checks for an explicit yes, so the gate doesn't depend on the model remembering to ask.
- **AWS:** review replies are drafted by Claude on **Amazon Bedrock** (Converse API). The MCP server is packaged as an ARM64 container for **Amazon Bedrock AgentCore Runtime**.

## Challenges we ran into

- **Unreliable AI suggestions.** In production we found that AI-generated queries and listing suggestions weren't reliable enough to run unreviewed, which is why we built the approval gate into the core design rather than adding it later.
- **Engine reliability.** One AI engine's API failed often enough that we removed it from scoring altogether, because inconsistent data is worse than less data.
- **Voice is a different interface.** A score table that works on a dashboard is unusable when spoken, so we had to rethink how every answer is phrased.
- **Alexa+'s 500 ms budget.** Alexa+ expects a tool round trip in under half a second. Multi-model scoring takes minutes and an LLM-drafted reply takes seconds, so we moved both out of the request path: scores are computed ahead of time, and Bedrock drafts replies in the background as soon as a review arrives. Every tool call now completes in under 20 ms, with a template fallback if a draft isn't ready.
- **The assistant writes the answer, not us.** Alexa+ composes the spoken reply from tool output, so voice guidance can't live only in a skill file. We put a ready-to-speak sentence in every tool result and repeated the voice rules in the server instructions.

## Accomplishments that we're proud of

- Reusing a scoring methodology already proven with real clients (38.75 → 76 GEO score over 17 audit runs) rather than building a demo-only toy.
- A voice-first design where trust is built in: nothing public happens without a spoken yes, and the server enforces it.
- Five working MCP tools, an end-to-end demo conversation, and every call under 20 ms.

## What we learned

- Voice-first agents need answers designed for the ear, not adapted from dashboards.
- For businesses, trust beats autonomy: an approval step makes owners more willing to use an agent, not less.
- MCP and Agent Skills separate "what the agent can do" from "how it should behave," which made the same engine easy to expose through a new interface.
- Wrapping an existing MCP server as an Alexa+ add-on is a small step once it speaks Streamable HTTP. The real work is latency and phrasing.
- **Feedback for the Amazon team:** we'd love a documented way to give Alexa+ voice-style guidance for an add-on (like a SKILL.md), a built-in confirmation primitive for write actions so every developer doesn't build their own gate, and clearer guidance on using AgentCore-hosted servers with the add-on OAuth requirements.

## What's next for Local Pulse

- Connect live client data across more locations and verticals.
- Add proactive voice briefings, such as a weekly "here's what changed" summary.
- Expand to more AI engines and to review and listing automation, always behind the approval gate.
- Bring it to more channels, such as WhatsApp, where many local owners already work.
