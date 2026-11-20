import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { countRows, db, uniqueEmail } from "./helpers";
import { BASE, followMagicLink, readMagicLink, readSessionCookie, signInTrial } from "./session";

async function call({
  cookie,
  path,
  method = "GET",
  body,
}: {
  cookie: string;
  path: string;
  method?: string;
  body?: unknown;
}) {
  return SELF.fetch(`${BASE}${path}`, {
    method,
    headers: {
      cookie,
      "content-type": "application/json",
      origin: BASE,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function invite({ cookie, email }: { cookie: string; email: string }) {
  return call({ cookie, path: "/api/seats", method: "POST", body: { email } });
}

async function acceptInvite(email: string) {
  const response = await followMagicLink(await readMagicLink(email));
  return readSessionCookie(response).pair;
}

describe("F8 team (Agency)", () => {
  it("F8: invite → magic link → seat active in the owner's workspace", async () => {
    const owner = await signInTrial({ email: uniqueEmail("owner"), plan: "agency" });
    const memberEmail = uniqueEmail("member");

    const invited = await invite({ cookie: owner.cookie, email: memberEmail });
    const seatBefore = await invited.json<{ id: string; status: string }>();
    const mail = await db
      .prepare("SELECT subject FROM dev_outbox WHERE to_address = ? ORDER BY id DESC LIMIT 1")
      .bind(memberEmail)
      .first<{ subject: string }>();
    const memberCookie = await acceptInvite(memberEmail);
    const me = await (
      await call({ cookie: memberCookie, path: "/api/me" })
    ).json<{ account: { id: string }; role: string }>();
    const seats = await (
      await call({ cookie: owner.cookie, path: "/api/seats" })
    ).json<Array<{ email: string; status: string }>>();

    expect(invited.status).toBe(201);
    expect(seatBefore.status).toBe("invited");
    expect(mail?.subject).toBe("You're invited to an InboxSieve workspace");
    expect(me).toMatchObject({ account: { id: owner.accountId }, role: "member" });
    expect(seats.find((seat) => seat.email === memberEmail)?.status).toBe("active");
    expect(
      await countRows({
        sql: "SELECT COUNT(*) AS n FROM accounts a JOIN users u ON u.id = a.owner_user_id WHERE u.email = ?",
        binds: [memberEmail],
      }),
    ).toBe(0);
  });

  it("F8: the 4th Agency seat is blocked with plan_limit", async () => {
    const owner = await signInTrial({ email: uniqueEmail("owner4"), plan: "agency" });

    const second = await invite({ cookie: owner.cookie, email: uniqueEmail("m2") });
    const third = await invite({ cookie: owner.cookie, email: uniqueEmail("m3") });
    const fourth = await invite({ cookie: owner.cookie, email: uniqueEmail("m4") });

    expect([second.status, third.status, fourth.status]).toEqual([201, 201, 403]);
    expect(await fourth.json()).toMatchObject({ error: "plan_limit" });
  });

  it("F8: Solo has one seat, so any invite is blocked", async () => {
    const owner = await signInTrial({ email: uniqueEmail("solo") });

    const response = await invite({ cookie: owner.cookie, email: uniqueEmail("m") });

    expect(response.status).toBe(403);
  });

  it("F8: a revoked seat's session gets 401 at once", async () => {
    const owner = await signInTrial({ email: uniqueEmail("owner-r"), plan: "agency" });
    const memberEmail = uniqueEmail("leaver");
    const seat = await (await invite({ cookie: owner.cookie, email: memberEmail })).json<{ id: string }>();
    const memberCookie = await acceptInvite(memberEmail);
    const before = await call({ cookie: memberCookie, path: "/api/brands" });

    const revoked = await call({ cookie: owner.cookie, path: `/api/seats/${seat.id}`, method: "DELETE" });
    const after = await call({ cookie: memberCookie, path: "/api/brands" });

    expect(before.status).toBe(200);
    expect(revoked.status).toBe(200);
    expect(after.status).toBe(401);
  });

  it("F8: members can't invite or revoke, and the owner seat can't be revoked", async () => {
    const owner = await signInTrial({ email: uniqueEmail("owner-m"), plan: "agency" });
    const memberEmail = uniqueEmail("plain");
    await invite({ cookie: owner.cookie, email: memberEmail });
    const memberCookie = await acceptInvite(memberEmail);
    const seats = await (
      await call({ cookie: owner.cookie, path: "/api/seats" })
    ).json<Array<{ id: string; role: string }>>();
    const ownerSeat = seats.find((seat) => seat.role === "owner");

    const memberInvite = await invite({ cookie: memberCookie, email: uniqueEmail("x") });
    const revokeOwner = await call({ cookie: owner.cookie, path: `/api/seats/${ownerSeat?.id}`, method: "DELETE" });

    expect(memberInvite.status).toBe(403);
    expect(revokeOwner.status).toBe(404);
  });
});
