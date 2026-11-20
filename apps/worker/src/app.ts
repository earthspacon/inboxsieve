import { brandRoutes } from "./api/brands";
import type { ApiContext, PublicContext } from "./api/context";
import { devRoutes } from "./api/dev";
import { leadRoutes } from "./api/leads";
import { sourceRoutes } from "./api/sources";
import { createAuth } from "./auth";
import type { Deps } from "./deps";
import { isDev } from "./env";
import { HttpError, errorResponse, matchRoute, type Route } from "./http";
import { handleWebhook } from "./ingest/webhook";
import { runDueJobs } from "./leads/jobs";
import { getAccountContext } from "./repo";

const API_ROUTES: Route<ApiContext>[] = [...brandRoutes, ...sourceRoutes, ...leadRoutes];
const READ_METHODS = new Set(["GET", "HEAD"]);
const AUTH_PREFIX = "/api/auth/";
const WEBHOOK_PATH = /^\/h\/([a-f0-9]{32})$/;

export async function handleRequest({ deps, request }: { deps: Deps; request: Request }) {
  try {
    return await routeRequest({ deps, request });
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error);
    }
    console.error("Unhandled request error", error instanceof Error ? error.name : "unknown");
    return errorResponse(new HttpError(500, "internal", "Something went wrong"));
  }
}

async function routeRequest({ deps, request }: { deps: Deps; request: Request }) {
  const { pathname } = new URL(request.url);
  const webhook = WEBHOOK_PATH.exec(pathname);

  if (webhook && request.method === "POST") {
    const response = await handleWebhook({ db: deps.db, request, token: webhook[1], now: deps.now() });
    deps.schedule(runDueJobs({ db: deps.db, analyzer: deps.analyzer, now: deps.now() }));
    return response;
  }
  if (pathname.startsWith("/h/")) {
    throw new HttpError(404, "not_found", "Unknown webhook");
  }
  if (pathname.startsWith(AUTH_PREFIX)) {
    return createAuth({ env: deps.env, mailer: deps.mailer }).handler(request);
  }
  if (pathname.startsWith("/dev/")) {
    return routeDevRequest({ deps, request });
  }
  if (pathname.startsWith("/api/")) {
    return routeApiRequest({ deps, request });
  }
  throw new HttpError(404, "not_found", "Not found");
}

async function routeDevRequest({ deps, request }: { deps: Deps; request: Request }) {
  const match = isDev(deps.env) ? matchRoute<PublicContext>({ routes: devRoutes, request }) : null;

  if (!match) {
    throw new HttpError(404, "not_found", "Not found");
  }
  return match.route.handler({
    deps,
    request,
    params: match.params,
  });
}

async function routeApiRequest({ deps, request }: { deps: Deps; request: Request }) {
  const match = matchRoute<ApiContext>({ routes: API_ROUTES, request });

  if (!match) {
    throw new HttpError(404, "not_found", "Not found");
  }

  const session = await createAuth({ env: deps.env, mailer: deps.mailer }).api.getSession({ headers: request.headers });
  if (!session) {
    throw new HttpError(401, "unauthorized", "Sign in first");
  }

  const account = await getAccountContext({ db: deps.db, userId: session.user.id });
  if (!account) {
    throw new HttpError(403, "no_account", "This user has no active seat");
  }
  if (account.access === "locked" && pathname(request) !== "/api/me") {
    throw new HttpError(402, "subscription_required", "Finish checkout to use InboxSieve");
  }
  if (account.access === "read_only" && !READ_METHODS.has(request.method)) {
    throw new HttpError(403, "read_only", "The account is read-only");
  }

  return match.route.handler({
    deps,
    account,
    request,
    params: match.params,
  });
}

function pathname(request: Request) {
  return new URL(request.url).pathname;
}
