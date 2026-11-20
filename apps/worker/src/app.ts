import { billingRoutes } from "./api/billing";
import { brandRoutes } from "./api/brands";
import { dataRoutes } from "./api/data";
import { teamRoutes } from "./api/team";
import type { ApiContext, PublicContext } from "./api/context";
import { devRoutes } from "./api/dev";
import { leadRoutes } from "./api/leads";
import { sourceRoutes } from "./api/sources";
import { createAuth } from "./auth";
import { handlePaddleWebhook } from "./billing/webhook";
import type { Deps } from "./deps";
import { isDev } from "./env";
import { HttpError, errorResponse, matchRoute, type Route } from "./http";
import { handleWebhook } from "./ingest/webhook";
import { runQueues } from "./leads/jobs";
import { getAccountContext, getBrand, type AccountContext } from "./repo";

const API_ROUTES: Route<ApiContext>[] = [
  ...brandRoutes,
  ...sourceRoutes,
  ...leadRoutes,
  ...billingRoutes,
  ...teamRoutes,
  ...dataRoutes,
];
const PADDLE_WEBHOOK_PATH = "/paddle/webhook";
const BRAND_PATH = "/api/brands/:brandId";
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
    deps.schedule(runQueues(deps));
    return response;
  }
  if (pathname === PADDLE_WEBHOOK_PATH && request.method === "POST") {
    return handlePaddleWebhook({ deps, request });
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
  if (account.access === "read_only" && !READ_METHODS.has(request.method)) {
    throw new HttpError(403, "read_only", "The account is read-only");
  }

  // Deleting a read-only brand is how an account gets back under its plan, so only that write is allowed.
  const isBrandDelete = request.method === "DELETE" && match.route.pattern.pathname === BRAND_PATH;
  if (match.params.brandId && !READ_METHODS.has(request.method) && !isBrandDelete) {
    await requireWritableBrand({ deps, account, brandId: match.params.brandId });
  }

  return match.route.handler({
    deps,
    account,
    request,
    params: match.params,
  });
}

async function requireWritableBrand({
  deps,
  account,
  brandId,
}: {
  deps: Deps;
  account: AccountContext;
  brandId: string;
}) {
  const brand = await getBrand({ db: deps.db, accountId: account.accountId, brandId });

  if (brand?.readOnly) {
    throw new HttpError(403, "read_only", "This brand is read-only on your current plan. Upgrade to edit it");
  }
}
