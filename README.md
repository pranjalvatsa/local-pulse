# Local Pulse

AI-visibility management for multi-location local businesses, inside Alexa+. An MCP server (TypeScript, Streamable HTTP) that lets an owner ask "How are my four clinics showing up in AI search this week?" and get a short spoken answer. Anything public, like a review reply, waits for the owner's explicit yes.

- [`mcp-server/`](mcp-server/): the MCP server, 5 tools, mock data, Dockerfile for Amazon Bedrock AgentCore Runtime, Alexa+ add-on template
- [`skills/voice-briefing/SKILL.md`](skills/voice-briefing/SKILL.md): how the assistant should brief an owner by voice
- [`PLAN.md`](PLAN.md): architecture, AWS stack, build order, demo script
- [`submission/`](submission/): hackathon story, gallery images, video script
- [`alexa-addon-assets/`](alexa-addon-assets/): icons, carousel and banner for the Alexa+ add-on listing; [PRIVACY.md](PRIVACY.md) and [TERMS.md](TERMS.md) for its required links

## Quick start

```bash
cd mcp-server
npm install
npm run build && npm start   # http://localhost:8000/mcp
npm run smoke                # in another terminal: plays the demo conversation
```
