import { SELF } from "cloudflare:test";

export const BASE = "http://localhost:8787";
// The token Turnstile's test sitekeys produce; the test secret key accepts only this one.
export const TURNSTILE_TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const LINK_PATTERN = /https?:\/\/\S+\/api\/auth\/magic-link\/verify\S+/;

export async function requestMagicLink(
  email: string,
  { turnstileToken = TURNSTILE_TEST_TOKEN, ip }: { turnstileToken?: string; ip?: string } = {},
) {
  const headers = new Headers({
    "content-type": "application/json",
    origin: BASE,
    "x-turnstile-token": turnstileToken,
  });
  if (ip) {
    headers.set("cf-connecting-ip", ip);
  }
  return SELF.fetch(`${BASE}/api/auth/sign-in/magic-link`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email,
      callbackURL: "/app",
      errorCallbackURL: "/sign-in",
    }),
  });
}

export async function readMagicLink(email: string) {
  const response = await SELF.fetch(`${BASE}/dev/outbox?to=${encodeURIComponent(email)}`);
  const mails: Array<{ body: string }> = await response.json();
  const link = mails[0]?.body.match(LINK_PATTERN)?.[0];

  if (!link) {
    throw new Error("no magic link in the dev outbox");
  }
  return link;
}

export async function followMagicLink(link: string) {
  return SELF.fetch(link, { redirect: "manual" });
}

export function readSessionCookie(response: Response) {
  const cookie = response.headers.getSetCookie().find((value) => value.includes("session_token="));

  if (!cookie) {
    throw new Error("no session cookie");
  }
  return {
    header: cookie,
    pair: cookie.split(";")[0],
  };
}

export async function signIn(email: string) {
  await requestMagicLink(email);
  const response = await followMagicLink(await readMagicLink(email));
  return readSessionCookie(response).pair;
}

export async function createTrialAccount(email: string) {
  const response = await SELF.fetch(`${BASE}/dev/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return response.json<{ accountId: string; brandId: string }>();
}

export async function signInTrial({ email }: { email: string }) {
  const response = await SELF.fetch(`${BASE}/dev/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
    }),
  });
  const account = await response.json<{ accountId: string; brandId: string }>();
  return {
    ...account,
    cookie: await signIn(email),
  };
}
