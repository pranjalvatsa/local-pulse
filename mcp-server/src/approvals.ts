// Human-approval gate. Every public action (review reply, listing change) is staged
// here as a pending action and only executes after the owner explicitly says yes.
// In-memory for the demo; use DynamoDB (with a TTL attribute) when deployed on AgentCore.

import { randomUUID } from "node:crypto";
import { REVIEWS } from "./data.js";

export type ActionKind = "publish_review_reply" | "update_listing";

export interface PendingAction {
  id: string;
  kind: ActionKind;
  summary: string; // one sentence the assistant reads back to the owner
  payload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "expired";
  createdAt: number;
  expiresAt: number;
  resolvedAt?: number;
}

const TTL_MS = 15 * 60_000;
const actions = new Map<string, PendingAction>();

export function stage(kind: ActionKind, summary: string, payload: Record<string, unknown>): PendingAction {
  const now = Date.now();
  // Short, speakable id so the owner (or assistant) can refer to it.
  const id = "act_" + randomUUID().slice(0, 6);
  const a: PendingAction = { id, kind, summary, payload, status: "pending", createdAt: now, expiresAt: now + TTL_MS };
  actions.set(id, a);
  return a;
}

export function listPending(): PendingAction[] {
  sweep();
  return [...actions.values()].filter((a) => a.status === "pending");
}

export function get(id: string) {
  sweep();
  return actions.get(id);
}

function sweep() {
  const now = Date.now();
  for (const a of actions.values()) if (a.status === "pending" && a.expiresAt < now) a.status = "expired";
}

// Utterances that count as an explicit yes. Anything else is not consent.
const AFFIRMATIVE = /^(yes|yeah|yep|yup|sure|ok(ay)?|confirm(ed)?|approve(d)?|go ahead|do it|send it|post it|publish( it)?)\b/i;

export function isExplicitYes(utterance: string): boolean {
  return AFFIRMATIVE.test(utterance.trim());
}

export function resolve(id: string, decision: "approve" | "reject"): PendingAction {
  const a = get(id);
  if (!a) throw new Error(`No action ${id}`);
  if (a.status !== "pending") throw new Error(`Action ${id} is already ${a.status}`);
  a.status = decision === "approve" ? "approved" : "rejected";
  a.resolvedAt = Date.now();
  if (a.status === "approved") execute(a);
  return a;
}

// The only place public side effects happen.
function execute(a: PendingAction) {
  if (a.kind === "publish_review_reply") {
    const replies = a.payload.replies as { reviewId: string; text: string }[];
    for (const reply of replies) {
      const r = REVIEWS.find((x) => x.id === reply.reviewId);
      if (r) r.replied = true;
    }
    // Live: POST to the Google Business Profile reviews API here.
  }
}
