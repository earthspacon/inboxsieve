import { MAX_SCORE, STAGE_TRANSITIONS, type Category, type LeadStatus } from "@inboxsieve/contract";

import { HttpError, json, readJson, readString, route, type Route } from "../http";
import { runQueues } from "../leads/jobs";
import { queueForAnalysis } from "../leads/pipeline";
import {
  addFeedback,
  getLead,
  listLeadEvents,
  listLeads,
  mapLeadRowToDetail,
  markLeadReplied,
  transitionLead,
  updateLeadDraft,
  updateLeadStage,
  type LeadFilters,
  type LeadRow,
} from "../repo";
import { createEnumGuard, readParam, requireBrand, type ApiContext } from "./context";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const DRAFT_MAX_LENGTH = 20_000;
const NOTE_MAX_LENGTH = 1000;
const QUERY_MAX_LENGTH = 200;

const CATEGORIES: Record<Category, true> = {
  hot: true,
  warm: true,
  cold: true,
  spam: true,
};

const LEAD_STATUSES: Record<LeadStatus, true> = {
  received: true,
  parsed: true,
  spam_filtered: true,
  queued: true,
  analyzing: true,
  analyzed: true,
  analysis_failed: true,
  over_quota: true,
  parse_failed: true,
};

const isCategory = createEnumGuard(CATEGORIES);
const isLeadStatus = createEnumGuard(LEAD_STATUSES);
const isLeadStage = createEnumGuard(STAGE_TRANSITIONS);

export const leadRoutes: Route<ApiContext>[] = [
  route("GET", "/api/brands/:brandId/leads", async ({ deps, account, params, request }) => {
    const brand = await requireBrand({ deps, account, brandId: params.brandId });
    const filters = readLeadFilters(new URL(request.url).searchParams);
    return json(await listLeads({ db: deps.db, brandId: brand.id, filters }));
  }),

  route("GET", "/api/brands/:brandId/leads/:leadId", async (context) => {
    const { deps, row } = await requireLead(context);
    return leadResponse({ deps, row });
  }),

  route("GET", "/api/brands/:brandId/leads/:leadId/original", async (context) => {
    const { row } = await requireLead(context);

    if (row.raw === null) {
      throw new HttpError(404, "not_found", "The original message is no longer stored");
    }
    return new Response(row.raw, { headers: { "content-type": "text/plain; charset=utf-8" } });
  }),

  route("PATCH", "/api/brands/:brandId/leads/:leadId/stage", async (context) => {
    const { deps, row } = await requireLead(context);
    const stage = (await readJson(context.request)).stage;

    if (!isLeadStage(stage)) {
      throw new HttpError(400, "invalid_field", '"stage" is not a known stage');
    }
    if (!STAGE_TRANSITIONS[row.stage].includes(stage)) {
      throw new HttpError(409, "invalid_transition", `A lead can't move from ${row.stage} to ${stage}`);
    }

    const updated = await updateLeadStage({
      db: deps.db,
      brandId: row.brand_id,
      leadId: row.id,
      from: row.stage,
      to: stage,
      now: deps.now(),
    });
    return leadResponse({ deps, row: requireUpdated(updated) });
  }),

  route("PUT", "/api/brands/:brandId/leads/:leadId/draft", async (context) => {
    const { deps, row } = await requireLead(context);
    const draft = readString({ data: await readJson(context.request), key: "draft", maxLength: DRAFT_MAX_LENGTH });
    const updated = await updateLeadDraft({
      db: deps.db,
      brandId: row.brand_id,
      leadId: row.id,
      draft,
      now: deps.now(),
    });
    return leadResponse({ deps, row: requireUpdated(updated) });
  }),

  route("POST", "/api/brands/:brandId/leads/:leadId/replied", async (context) => {
    const { deps, row } = await requireLead(context);
    const updated = await markLeadReplied({
      db: deps.db,
      brandId: row.brand_id,
      leadId: row.id,
      now: deps.now(),
    });

    if (!updated) {
      throw new HttpError(409, "invalid_transition", "Spam or lost leads cannot be marked replied");
    }
    return leadResponse({ deps, row: updated });
  }),

  route("POST", "/api/brands/:brandId/leads/:leadId/not-spam", async (context) => {
    const { deps, row } = await requireLead(context);
    const ref = {
      db: deps.db,
      brandId: row.brand_id,
      leadId: row.id,
      now: deps.now(),
    };

    if (row.stage !== "spam") {
      throw new HttpError(409, "invalid_transition", "The lead is not marked as spam");
    }

    await updateLeadStage({
      ...ref,
      from: "spam",
      to: "new",
    });
    await addFeedback({
      ...ref,
      kind: "not_spam",
      expectedScore: null,
      note: "",
    });
    if (row.status === "spam_filtered") {
      await queueForAnalysis({
        ...ref,
        from: "spam_filtered",
      });
      deps.schedule(runQueues(deps));
    }
    return leadResponse({ deps, row: requireUpdated(await getLead(ref)) });
  }),

  route("POST", "/api/brands/:brandId/leads/:leadId/feedback", async (context) => {
    const { deps, row } = await requireLead(context);
    const data = await readJson(context.request);
    const expectedScore = data.expectedScore;

    if (
      typeof expectedScore !== "number" ||
      !Number.isInteger(expectedScore) ||
      expectedScore < 0 ||
      expectedScore > MAX_SCORE
    ) {
      throw new HttpError(400, "invalid_field", '"expectedScore" must be an integer from 0 to 100');
    }

    const id = await addFeedback({
      db: deps.db,
      brandId: row.brand_id,
      leadId: row.id,
      kind: "wrong_score",
      expectedScore,
      note: data.note === undefined ? "" : readString({ data, key: "note", maxLength: NOTE_MAX_LENGTH }),
      now: deps.now(),
    });
    return json({ id }, 201);
  }),

  route("POST", "/api/brands/:brandId/leads/:leadId/retry", async (context) => {
    const { deps, row } = await requireLead(context);
    const updated = await transitionLead({
      db: deps.db,
      brandId: row.brand_id,
      leadId: row.id,
      from: "analysis_failed",
      to: "queued",
      set: {
        attempts: 0,
        next_attempt_at: deps.now().toISOString(),
        last_error: null,
      },
      now: deps.now(),
    });

    if (!updated) {
      throw new HttpError(409, "invalid_transition", "Only a lead whose analysis failed can be retried");
    }
    deps.schedule(runQueues(deps));
    return leadResponse({ deps, row: updated, status: 202 });
  }),
];

async function requireLead({ deps, account, params }: ApiContext & { params: Record<string, string> }) {
  const brand = await requireBrand({ deps, account, brandId: params.brandId });
  const row = await getLead({ db: deps.db, brandId: brand.id, leadId: readParam({ params, key: "leadId" }) });

  if (!row) {
    throw new HttpError(404, "not_found", "Lead not found");
  }
  return {
    deps,
    row,
  };
}

function requireUpdated(row: LeadRow | null) {
  if (!row) {
    throw new HttpError(409, "conflict", "The lead changed in the meantime, reload it");
  }
  return row;
}

async function leadResponse({ deps, row, status = 200 }: { deps: ApiContext["deps"]; row: LeadRow; status?: number }) {
  const events = await listLeadEvents({ db: deps.db, brandId: row.brand_id, leadId: row.id });
  return json(mapLeadRowToDetail({ row, events }), status);
}

function readLeadFilters(search: URLSearchParams): LeadFilters {
  const category = search.get("category");
  const stage = search.get("stage");
  const status = search.get("status");

  return {
    scoreMin: readScore({ search, key: "scoreMin" }),
    scoreMax: readScore({ search, key: "scoreMax" }),
    category: isCategory(category) ? category : null,
    stage: isLeadStage(stage) ? stage : null,
    status: isLeadStatus(status) ? status : null,
    query: search.get("q")?.trim().slice(0, QUERY_MAX_LENGTH) || null,
    before: search.get("before"),
    limit: Math.min(Number(search.get("limit")) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  };
}

function readScore({ search, key }: { search: URLSearchParams; key: string }) {
  const value = search.get(key);

  if (value === null || value === "") {
    return null;
  }
  const score = Number(value);
  if (!Number.isFinite(score)) {
    throw new HttpError(400, "invalid_field", `"${key}" must be a number`);
  }
  return score;
}
