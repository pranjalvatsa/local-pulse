// Review-reply drafting. Uses Amazon Bedrock (Converse API) when BEDROCK_MODEL_ID is set,
// otherwise falls back to a deterministic template so the demo works offline.
//
// Alexa+ requires tool round trips under ~500 ms, and an LLM call is slower than that.
// So drafts are generated ahead of time (prewarmDrafts) and cached; at request time we
// serve the cached draft, or the template if Bedrock hasn't finished yet.

import type { Location, Review } from "./data.js";

export type Tone = "warm" | "apologetic" | "brief";

function template(review: Review, loc: Location, tone: Tone): string {
  const first = review.author.split(" ")[0];
  if (review.rating >= 4) {
    return `Thank you, ${first}! We're so glad you had a great visit to our ${loc.shortName} office. We look forward to seeing you again.`;
  }
  const opener = tone === "brief" ? `${first}, we're sorry about this.` : `${first}, thank you for telling us, and we're truly sorry about your experience.`;
  return `${opener} This isn't the standard we hold ourselves to at ${loc.shortName}. Our office manager would like to make it right. Please call us at ${loc.gbp.phone} and ask for Dana.`;
}

async function generate(review: Review, loc: Location, tone: Tone): Promise<{ text: string; source: "bedrock" | "template" }> {
  const modelId = process.env.BEDROCK_MODEL_ID;
  if (!modelId) return { text: template(review, loc, tone), source: "template" };
  try {
    const { BedrockRuntimeClient, ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");
    const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-1" });
    const res = await client.send(
      new ConverseCommand({
        modelId,
        system: [{
          text:
            "You write public replies to Google reviews for a dental practice. 2-3 sentences, " +
            "no medical or billing details, never admit legal fault, never mention the patient's treatment. " +
            "For negative reviews, apologize and invite them to call the office. Output only the reply text.",
        }],
        messages: [{
          role: "user",
          content: [{ text: `Tone: ${tone}\nLocation: ${loc.name}, phone ${loc.gbp.phone}\nReviewer: ${review.author}\nRating: ${review.rating}/5\nReview: ${review.text}` }],
        }],
        inferenceConfig: { maxTokens: 200, temperature: 0.4 },
      }),
    );
    const text = res.output?.message?.content?.map((c) => c.text ?? "").join("").trim();
    if (text) return { text, source: "bedrock" };
  } catch (err) {
    console.error("Bedrock drafting failed, using template:", (err as Error).message);
  }
  return { text: template(review, loc, tone), source: "template" };
}

const cache = new Map<string, Promise<{ text: string; source: "bedrock" | "template" }>>();
const key = (r: Review, tone: Tone) => `${r.id}:${tone}`;

export function prewarmDrafts(items: { review: Review; loc: Location; tone: Tone }[]) {
  if (!process.env.BEDROCK_MODEL_ID) return;
  for (const { review, loc, tone } of items) if (!cache.has(key(review, tone))) cache.set(key(review, tone), generate(review, loc, tone));
}

export async function draftReply(review: Review, loc: Location, tone: Tone, budgetMs = 350) {
  const k = key(review, tone);
  if (!cache.has(k)) cache.set(k, generate(review, loc, tone));
  const timeout = new Promise<{ text: string; source: "template" }>((res) =>
    setTimeout(() => res({ text: template(review, loc, tone), source: "template" }), budgetMs),
  );
  return Promise.race([cache.get(k)!, timeout]);
}
