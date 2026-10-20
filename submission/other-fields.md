# Built with (paste as tags)

typescript, node.js, model-context-protocol, mcp, alexa, alexa-plus, alexa-ai-cli, amazon-web-services, amazon-bedrock, amazon-bedrock-agentcore, claude, docker, express.js, zod, google-business-profile, openai, gemini, perplexity

Only keep a tag if it's true when you submit. Add strands-agents, dynamodb, aws-lambda or amazon-polly only if you build those parts.

# "Try it out" links

1. GitHub repo with the code (needed; I can create and push it).
2. Optional: the Alexa+ add-on listing link once `alexa-ai submit` is done, or skip it.

# Image gallery (1500x1000, 3:2)

Upload in this order:
1. gallery-cover.png
2. gallery-conversation.png
3. gallery-architecture.png
4. gallery-scoring.png
5. Optional: a screenshot of the real Alexa+ Web Simulator running the conversation (strongest proof it works).

# Video demo (aim for 2 to 3 minutes; upload to YouTube as Unlisted or Public, paste the link)

0:00 to 0:15. Hook, voice over the cover image: "People now ask AI where to eat or which dentist to see. Most owners have no idea if AI recommends them. Local Pulse lets them just ask Alexa."
0:15 to 1:30. Screen record the Alexa+ Web Simulator (or your terminal running `npm run smoke` as a backup):
  - "How are my four clinics showing up in AI search this week?"
  - "Why did Riverside drop?" (ChatGPT has the wrong hours)
  - "Which location has unanswered reviews?"
  - "Draft replies to the two negative ones."
  - "Hmm, what did the second one say?" Pause and point out nothing was posted.
  - "Yes, post them."
1:30 to 2:10. Show the architecture image and the code for approve_action: "The server checks the owner's exact words. The model can't skip the gate."
2:10 to 2:30. Show the scoring image: "Same method that took a real client from 38.75 to 76." Close with what's next.

Tips: record at 1080p, turn on captions, keep your face cam optional.
