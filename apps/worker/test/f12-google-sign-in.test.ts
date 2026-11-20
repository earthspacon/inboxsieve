import { SIGN_IN_OPTIONS_PATH } from "@inboxsieve/contract";
import { env } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { handleRequest } from "../src/app";
import { GOOGLE_TOKEN_URL, isGoogleSignInEnabled } from "../src/auth";
import type { Env } from "../src/env";
import { buildTestDeps, countRows, createMockAnalyzer, db, uniqueEmail } from "./helpers";
import { BASE, readSessionCookie, signIn } from "./session";

const baseEnv: Env = env;
const GOOGLE_ENV = {
  GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
};

// The profile the fake Google token endpoint puts into the id_token of the next code exchange.
let nextGoogleProfile: Record<string, unknown> = {};
const realFetch = globalThis.fetch;

function encodeSegment(value: object) {
  return btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

beforeAll(() => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.url !== GOOGLE_TOKEN_URL) {
      return previousFetch(input, init);
    }
    const idToken = [
      encodeSegment({ alg: "RS256", kid: "test" }),
      encodeSegment({ iss: "https://accounts.google.com", aud: GOOGLE_ENV.GOOGLE_CLIENT_ID, ...nextGoogleProfile }),
      "signature",
    ].join(".");
    return Response.json({
      access_token: "ya29.test",
      expires_in: 3599,
      token_type: "Bearer",
      scope: "openid email profile",
      id_token: idToken,
    });
  };
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

function send({ extraEnv = {}, path, init = {} }: { extraEnv?: Partial<Env>; path: string; init?: RequestInit }) {
  const { deps } = buildTestDeps({ analyzer: createMockAnalyzer().analyzer });
  return handleRequest({
    deps: { ...deps, env: { ...baseEnv, ...extraEnv } },
    request: new Request(`${BASE}${path}`, init),
  });
}

function startGoogleSignIn(extraEnv: Partial<Env>) {
  return send({
    extraEnv,
    path: "/api/auth/sign-in/social",
    init: {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({
        provider: "google",
        callbackURL: "/app",
        newUserCallbackURL: "/app/onboarding",
        errorCallbackURL: "/sign-in",
      }),
    },
  });
}

async function signInWithGoogle(profile: Record<string, unknown>) {
  const started = await startGoogleSignIn(GOOGLE_ENV);
  const { url } = await started.json<{ url: string }>();
  const state = new URL(url).searchParams.get("state") ?? "";
  const cookies = started.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  nextGoogleProfile = profile;

  return send({
    extraEnv: GOOGLE_ENV,
    path: `/api/auth/callback/google?code=test-code&state=${encodeURIComponent(state)}`,
    init: { headers: { cookie: cookies }, redirect: "manual" },
  });
}

function googleProfile(email: string) {
  return {
    sub: `google-${crypto.randomUUID()}`,
    email,
    email_verified: true,
    name: "Test Person",
  };
}

describe("F12 Google sign-in", () => {
  it("is enabled only when both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set", () => {
    expect(isGoogleSignInEnabled(baseEnv)).toBe(false);
    expect(isGoogleSignInEnabled({ ...baseEnv, GOOGLE_CLIENT_ID: GOOGLE_ENV.GOOGLE_CLIENT_ID })).toBe(false);
    expect(isGoogleSignInEnabled({ ...baseEnv, GOOGLE_CLIENT_SECRET: GOOGLE_ENV.GOOGLE_CLIENT_SECRET })).toBe(false);
    expect(isGoogleSignInEnabled({ ...baseEnv, ...GOOGLE_ENV })).toBe(true);
  });

  it("the public sign-in options tell the page whether to show the Google button", async () => {
    const without = await send({ path: SIGN_IN_OPTIONS_PATH });
    const half = await send({ path: SIGN_IN_OPTIONS_PATH, extraEnv: { GOOGLE_CLIENT_ID: "only-the-id" } });
    const withBoth = await send({ path: SIGN_IN_OPTIONS_PATH, extraEnv: GOOGLE_ENV });

    expect(without.status).toBe(200);
    expect(await without.json()).toEqual({ google: false });
    expect(await half.json()).toEqual({ google: false });
    expect(await withBoth.json()).toEqual({ google: true });
  });

  it("without the env vars the Google provider is not registered and the request fails cleanly", async () => {
    const without = await startGoogleSignIn({});
    const half = await startGoogleSignIn({ GOOGLE_CLIENT_SECRET: GOOGLE_ENV.GOOGLE_CLIENT_SECRET });

    expect(without.status).toBeGreaterThanOrEqual(400);
    expect(without.status).toBeLessThan(500);
    expect(half.status).toBeGreaterThanOrEqual(400);
    expect(half.status).toBeLessThan(500);
  });

  it("with both env vars it redirects to Google with only openid email profile and our callback URL, no Turnstile needed", async () => {
    const response = await startGoogleSignIn(GOOGLE_ENV);
    const { url, redirect } = await response.json<{ url: string; redirect: boolean }>();
    const google = new URL(url);

    expect(response.status).toBe(200);
    expect(redirect).toBe(true);
    expect(google.origin).toBe("https://accounts.google.com");
    expect(google.searchParams.get("client_id")).toBe(GOOGLE_ENV.GOOGLE_CLIENT_ID);
    expect(google.searchParams.get("redirect_uri")).toBe(`${BASE}/api/auth/callback/google`);
    expect(new Set(google.searchParams.get("scope")?.split(" "))).toEqual(new Set(["openid", "email", "profile"]));
    expect(google.searchParams.get("prompt")).toBe("select_account");
  });

  it("a new Google user is signed in without a magic link, verified, and starts on the Free plan", async () => {
    const email = uniqueEmail("google-new");

    const response = await signInWithGoogle(googleProfile(email));
    const cookie = readSessionCookie(response).pair;
    const me = await send({ path: "/api/me", init: { headers: { cookie } } });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toMatch(/\/app\/onboarding$/);
    expect(await me.json()).toMatchObject({ user: { email }, account: { plan: "free" } });
    expect(
      await countRows({
        sql: "SELECT COUNT(*) AS n FROM users WHERE email = ? AND email_verified = 1",
        binds: [email],
      }),
    ).toBe(1);
    expect(await countRows({ sql: "SELECT COUNT(*) AS n FROM dev_outbox WHERE to_address = ?", binds: [email] })).toBe(
      0,
    );
  });

  it("the same email via magic link and via Google is one user and one account", async () => {
    const email = uniqueEmail("google-link");
    await signIn(email);
    const before = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>();

    const response = await signInWithGoogle(googleProfile(email));
    const cookie = readSessionCookie(response).pair;
    const me = await send({ path: "/api/me", init: { headers: { cookie } } });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toMatch(/\/app$/);
    expect(await countRows({ sql: "SELECT COUNT(*) AS n FROM users WHERE email = ?", binds: [email] })).toBe(1);
    expect(
      await countRows({
        sql: "SELECT COUNT(*) AS n FROM auth_identities WHERE user_id = ? AND provider_id = 'google'",
        binds: [before?.id],
      }),
    ).toBe(1);
    expect(
      await countRows({
        sql: "SELECT COUNT(*) AS n FROM seats WHERE email = ?",
        binds: [email],
      }),
    ).toBe(1);
    expect(await me.json()).toMatchObject({ user: { email } });
  });
});

describe("F12 unknown public paths", () => {
  const NOT_FOUND_HTML =
    '<html><head><meta name="robots" content="noindex" /></head><body>Page not found</body></html>';
  const fakeAssets = {
    fetch: async (input: RequestInfo | URL) => {
      const { pathname } = new URL(input instanceof Request ? input.url : input);
      return pathname === "/404"
        ? new Response(NOT_FOUND_HTML, { headers: { "content-type": "text/html" } })
        : new Response("missing", { status: 404 });
    },
  } as unknown as Fetcher;

  it("GET /foo answers 404 with the prerendered page, noindex and the security headers", async () => {
    const response = await send({ path: "/foo", extraEnv: { ASSETS: fakeAssets } });

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.get("content-security-policy")).toBeTruthy();
    expect(await response.text()).toBe(NOT_FOUND_HTML);
  });

  it("HEAD gets the 404 without a body; POST to an unknown path and unknown /api paths stay JSON 404s", async () => {
    const head = await send({ path: "/foo", extraEnv: { ASSETS: fakeAssets }, init: { method: "HEAD" } });
    const post = await send({ path: "/foo", extraEnv: { ASSETS: fakeAssets }, init: { method: "POST" } });
    const api = await send({ path: "/api/nope", extraEnv: { ASSETS: fakeAssets } });

    expect(head.status).toBe(404);
    expect(await head.text()).toBe("");
    expect(post.status).toBe(404);
    expect(post.headers.get("content-type")).toMatch(/json/);
    expect(api.status).toBe(404);
    expect(api.headers.get("content-type")).toMatch(/json/);
  });
});
