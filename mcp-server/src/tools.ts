import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LOCATIONS, OWNER, REVIEWS, findLocation } from "./data.js";
import { allReports, visibilityReport, type VisibilityReport } from "./scoring.js";
import { draftReply } from "./drafting.js";
import * as gate from "./approvals.js";

// Every tool returns { speak, next_step, data }.
// `speak` is a voice-ready sentence or two; `data` is the detail for screens and follow-ups.
function reply(speak: string, nextStep: string | null, data: unknown) {
  const body = { speak, next_step: nextStep, data };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }],
    structuredContent: body as Record<string, unknown>,
  };
}

const r1 = (n: number) => Math.round(n);
const verb = (r: VisibilityReport) =>
  r.trend === "up" ? `up ${r1(r.change)} points` : r.trend === "down" ? `down ${r1(-r.change)} points` : "about flat";

const locationArg = z
  .string()
  .optional()
  .describe('Location id or spoken name, e.g. "Riverside". Omit for all locations.');

export function registerTools(server: McpServer) {
  server.registerTool(
    "get_ai_visibility_score",
    {
      title: "AI visibility score",
      description:
        "How often AI answer engines (ChatGPT, Gemini, Perplexity) recommend the owner's business this week, " +
        "per location or for all locations. Brand-name queries are excluded. Also returns factual errors AI engines " +
        "made, validated against Google Business Profile.",
      inputSchema: { location: locationArg },
      annotations: { readOnlyHint: true },
    },
    async ({ location }) => {
      if (location) {
        const loc = findLocation(location);
        if (!loc) return reply(`I couldn't find a location called ${location}.`, `Your locations are ${LOCATIONS.map((l) => l.shortName).join(", ")}.`, null);
        const r = visibilityReport(loc);
        const issue = r.entityIssues[0];
        const speak =
          `${loc.shortName} scores ${r1(r.score)} out of 100 in AI search, ${verb(r)} from last week.` +
          (issue ? ` ${cap(issue.engine)} has the wrong ${issue.field} for it.` : "");
        return reply(speak, `Want to see the reviews waiting at ${loc.shortName}?`, r);
      }
      const reports = allReports();
      const avg = reports.reduce((s, r) => s + r.score, 0) / reports.length;
      const best = [...reports].sort((a, b) => b.score - a.score)[0];
      const worst = [...reports].sort((a, b) => a.change - b.change)[0];
      const speak =
        `Across your ${spell(reports.length)} clinics you average ${r1(avg)} out of 100 in AI search. ` +
        `${best.shortName} leads at ${r1(best.score)}` +
        (worst.trend === "down" ? `, but ${worst.shortName} dropped ${r1(-worst.change)} points to ${r1(worst.score)}.` : ".");
      return reply(speak, worst.trend === "down" ? `Want to hear what's dragging ${worst.shortName} down?` : null, {
        owner: OWNER,
        average: Math.round(avg * 10) / 10,
        locations: reports,
      });
    },
  );

  server.registerTool(
    "compare_locations",
    {
      title: "Compare locations",
      description:
        "Rank the owner's locations against each other on AI visibility score, week-over-week change, " +
        "unanswered reviews, or AI factual errors. Use for 'which clinic is doing best/worst' questions.",
      inputSchema: {
        metric: z.enum(["score", "change", "unanswered_reviews", "entity_issues"]).default("score"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ metric }) => {
      const rows = allReports().map((r) => ({
        location: r.shortName,
        locationId: r.locationId,
        score: r.score,
        change: r.change,
        unanswered_reviews: REVIEWS.filter((v) => v.locationId === r.locationId && !v.replied).length,
        entity_issues: r.entityIssues.length,
        trend: r.trend,
      }));
      const lowerIsBetter = metric === "unanswered_reviews" || metric === "entity_issues";
      rows.sort((a, b) => (lowerIsBetter ? a[metric] - b[metric] : b[metric] - a[metric]));
      const top = rows[0], bottom = rows[rows.length - 1];
      const label: Record<typeof metric, string> = {
        score: "AI visibility",
        change: "improvement this week",
        unanswered_reviews: "review response",
        entity_issues: "listing accuracy in AI answers",
      };
      const speak = `On ${label[metric]}, ${top.location} is best and ${bottom.location} needs the most attention` +
        (metric === "score" ? `, ${r1(top.score)} versus ${r1(bottom.score)}.` :
         metric === "change" ? `, ${fmtChange(top.change)} versus ${fmtChange(bottom.change)}.` :
         `, with ${bottom[metric]}.`);
      return reply(speak, `Want me to focus on ${bottom.location}?`, { metric, ranking: rows });
    },
  );

  server.registerTool(
    "list_pending_reviews",
    {
      title: "List unanswered reviews",
      description: "Google reviews that have no reply yet, optionally for one location or only negative ones (3 stars or less).",
      inputSchema: {
        location: locationArg,
        negative_only: z.boolean().default(false),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ location, negative_only }) => {
      const loc = location ? findLocation(location) : undefined;
      if (location && !loc) return reply(`I couldn't find a location called ${location}.`, null, null);
      const pending = REVIEWS.filter((r) => !r.replied && (!loc || r.locationId === loc.id) && (!negative_only || r.rating <= 3));
      if (!pending.length) return reply(`No unanswered ${negative_only ? "negative " : ""}reviews${loc ? ` at ${loc.shortName}` : ""}. You're all caught up.`, null, { reviews: [] });
      const neg = pending.filter((r) => r.rating <= 3);
      const byLoc = Object.entries(groupCount(pending.map((r) => LOCATIONS.find((l) => l.id === r.locationId)!.shortName)));
      const n = pending.length;
      const what = `${spell(n)} ${negative_only ? "negative " : ""}review${n > 1 ? "s" : ""} without a reply`;
      const where = byLoc.length === 1
        ? (n === 1 ? `at ${byLoc[0][0]}` : n === 2 ? `both at ${byLoc[0][0]}` : `all at ${byLoc[0][0]}`)
        : byLoc.map(([name, c]) => `${spell(c)} at ${name}`).join(", ").replace(/, ([^,]*)$/, " and $1");
      const speak = `You have ${what}, ${where}.` +
        (!negative_only && neg.length ? ` ${cap1(spell(neg.length))} ${neg.length > 1 ? "are" : "is"} negative.` : "");
      return reply(speak, neg.length ? `Want me to draft replies to the negative ${neg.length > 1 ? "ones" : "one"}?` : "Want me to draft thank-you replies?", {
        reviews: pending.map((r) => ({ ...r, location: LOCATIONS.find((l) => l.id === r.locationId)!.shortName })),
      });
    },
  );

  server.registerTool(
    "draft_review_reply",
    {
      title: "Draft review replies",
      description:
        "Draft replies to one or more reviews. Nothing is posted: the drafts are staged as a single pending action " +
        "that the owner must approve with approve_action. Read the draft (or a summary) to the owner and ask for a yes.",
      inputSchema: {
        review_ids: z.array(z.string()).min(1).max(5).describe("Review ids from list_pending_reviews"),
        tone: z.enum(["warm", "apologetic", "brief"]).default("warm"),
      },
    },
    async ({ review_ids, tone }) => {
      const reviews = review_ids.map((id) => REVIEWS.find((r) => r.id === id));
      const missing = review_ids.filter((_, i) => !reviews[i]);
      if (missing.length) return reply(`I couldn't find review ${missing.join(", ")}.`, "Want me to list the open reviews again?", null);
      const drafts = await Promise.all(
        reviews.map(async (r) => {
          const loc = LOCATIONS.find((l) => l.id === r!.locationId)!;
          const d = await draftReply(r!, loc, r!.rating <= 3 && tone === "warm" ? "apologetic" : tone);
          return { reviewId: r!.id, author: r!.author, rating: r!.rating, location: loc.shortName, text: d.text, source: d.source };
        }),
      );
      const summary = drafts.length === 1
        ? `Post a reply to ${drafts[0].author}'s ${drafts[0].rating}-star review at ${drafts[0].location}`
        : `Post ${spell(drafts.length)} review replies (${drafts.map((d) => d.author.split(" ")[0]).join(", ")})`;
      const action = gate.stage("publish_review_reply", summary, { replies: drafts.map(({ reviewId, text }) => ({ reviewId, text })) });
      const speak = drafts.length === 1
        ? `Here's the draft for ${drafts[0].author.split(" ")[0]}: ${drafts[0].text}`
        : `I drafted ${spell(drafts.length)} replies. Each one apologizes and invites them to call the office.`;
      return reply(speak, "Should I post " + (drafts.length === 1 ? "it" : "them") + "?", {
        action_id: action.id,
        requires_approval: true,
        expires_at: new Date(action.expiresAt).toISOString(),
        drafts,
      });
    },
  );

  server.registerTool(
    "approve_action",
    {
      title: "Approve or reject a pending public action",
      description:
        "The human-approval gate. Call ONLY after the owner has responded to a proposed public action. " +
        "Pass the owner's exact words in owner_utterance; the server checks for an explicit yes and refuses otherwise. " +
        "Never call this on the owner's behalf without their spoken or typed answer.",
      inputSchema: {
        action_id: z.string().optional().describe("From draft_review_reply. Optional if exactly one action is pending."),
        owner_utterance: z.string().describe("The owner's verbatim reply, e.g. 'yes, post them'"),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ action_id, owner_utterance }) => {
      const pending = gate.listPending();
      const id = action_id ?? (pending.length === 1 ? pending[0].id : undefined);
      if (!id) {
        return reply(
          pending.length ? `There are ${pending.length} things waiting for approval. Which one?` : "There's nothing waiting for your approval.",
          null,
          { pending: pending.map(({ id, summary }) => ({ id, summary })) },
        );
      }
      const action = gate.get(id);
      if (!action) return reply("I couldn't find that action.", null, null);
      if (action.status !== "pending") return reply(`That one is already ${action.status}.`, null, { action });

      const said = owner_utterance.trim();
      if (/^(no|nope|cancel|stop|don'?t|reject|not now|hold)/i.test(said)) {
        gate.resolve(id, "reject");
        return reply("Okay, I won't post anything.", "Want me to change the wording instead?", { action_id: id, status: "rejected" });
      }
      if (!gate.isExplicitYes(said)) {
        return reply(`Just to confirm: ${action.summary}?`, "Say yes to post, or no to cancel.", {
          action_id: id,
          status: "pending",
          reason: "No explicit yes in the owner's reply, so nothing was published.",
        });
      }
      const done = gate.resolve(id, "approve");
      return reply("Done. " + pastTense(done.summary) + ".", null, { action_id: id, status: done.status, executed: done.payload });
    },
  );
}

const cap = (s: string) => ({ chatgpt: "ChatGPT", gemini: "Gemini", perplexity: "Perplexity" } as Record<string, string>)[s] ?? s;
const fmtChange = (n: number) => (n >= 0 ? `up ${r1(n)}` : `down ${r1(-n)}`);
const spell = (n: number) => ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][n] ?? String(n);
const cap1 = (s: string) => s[0].toUpperCase() + s.slice(1);
const pastTense = (s: string) => s.replace(/^Post /, "Posted ");
function groupCount(xs: string[]) {
  return xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
}
