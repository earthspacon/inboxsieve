import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { db, uniqueEmail } from "./helpers";
import {
  BASE,
  createTrialAccount,
  followMagicLink,
  readMagicLink,
  readSessionCookie,
  requestMagicLink,
  signIn,
} from "./session";

describe("F1 sign-in (auth part)", () => {
  it("F1: the magic link from the dev outbox signs a trialing account in with an HttpOnly cookie", async () => {
    const email = uniqueEmail("trial");
    await createTrialAccount(email);

    const requested = await requestMagicLink(email);
    const verified = await followMagicLink(await readMagicLink(email));
    const cookie = readSessionCookie(verified);
    const me = await SELF.fetch(`${BASE}/api/me`, { headers: { cookie: cookie.pair } });
    const body = await me.json<{ user: { email: string }; account: { subscription: string }; brands: unknown[] }>();

    expect(requested.status).toBe(200);
    expect(verified.status).toBe(302);
    expect(verified.headers.get("location")).toMatch(/\/app$/);
    expect(cookie.header).toMatch(/HttpOnly/i);
    expect(me.status).toBe(200);
    expect(body.user.email).toBe(email);
    expect(body.account.subscription).toBe("trialing");
    expect(body.brands).toHaveLength(1);
  });

  it("F1: a new email gets an account in no_subscription that is locked behind checkout", async () => {
    const email = uniqueEmail("new");

    const cookie = await signIn(email);
    const me = await SELF.fetch(`${BASE}/api/me`, { headers: { cookie } });
    const brands = await SELF.fetch(`${BASE}/api/brands`, { headers: { cookie } });

    expect((await me.json<{ account: { subscription: string } }>()).account.subscription).toBe("no_subscription");
    expect(brands.status).toBe(402);
  });

  it('F1: a used magic link does not sign in again and sends the user to "send a new link"', async () => {
    const email = uniqueEmail("reuse");
    await createTrialAccount(email);
    await requestMagicLink(email);
    const link = await readMagicLink(email);

    await followMagicLink(link);
    const second = await followMagicLink(link);

    expect(second.status).toBe(302);
    expect(second.headers.get("location")).toMatch(/\/sign-in\?error=/);
    expect(second.headers.getSetCookie().some((value) => /session_token=[^;]+/.test(value))).toBe(false);
  });

  it("F1: a magic link older than 15 minutes is rejected", async () => {
    const email = uniqueEmail("expired");
    await createTrialAccount(email);
    await requestMagicLink(email);
    const link = await readMagicLink(email);
    await db
      .prepare("UPDATE magic_links SET expires_at = ?")
      .bind(new Date(Date.now() - 1000).toISOString())
      .run();

    const response = await followMagicLink(link);

    expect(response.headers.get("location")).toMatch(/\/sign-in\?error=/);
  });

  it("F1: the magic link is stored with a 15 minute expiry", async () => {
    const email = uniqueEmail("ttl");
    const before = Date.now();

    await requestMagicLink(email);

    const row = await db
      .prepare("SELECT expires_at FROM magic_links ORDER BY created_at DESC LIMIT 1")
      .first<{ expires_at: string }>();
    const ttlMs = new Date(row?.expires_at ?? 0).getTime() - before;
    expect(ttlMs).toBeGreaterThan(14 * 60_000);
    expect(ttlMs).toBeLessThanOrEqual(15 * 60_000 + 1000);
  });

  it("F1: sign-out ends the session and the API answers 401", async () => {
    const email = uniqueEmail("signout");
    await createTrialAccount(email);
    const cookie = await signIn(email);

    const signOut = await SELF.fetch(`${BASE}/api/auth/sign-out`, {
      method: "POST",
      headers: {
        cookie,
        origin: BASE,
      },
    });
    const me = await SELF.fetch(`${BASE}/api/me`, { headers: { cookie } });

    expect(signOut.status).toBe(200);
    expect(me.status).toBe(401);
  });

  it("F1: the API answers 401 without a session", async () => {
    const response = await SELF.fetch(`${BASE}/api/me`);

    expect(response.status).toBe(401);
  });
});
