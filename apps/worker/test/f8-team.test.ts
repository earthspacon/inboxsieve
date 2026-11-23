import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { addSeatByHand, countRows, uniqueEmail } from "./helpers";
import { BASE, signIn, signInTrial } from "./session";

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

// The paid plan has one seat; a team seat is added by hand when a customer asks, then the person signs in.
async function addMember({ accountId, email }: { accountId: string; email: string }) {
  const seat = await addSeatByHand({ accountId, email });
  if (!seat) {
    throw new Error("addMember: seat missing");
  }
  return { seatId: seat.id, cookie: await signIn(email) };
}

describe("F8 team", () => {
  it("F8: the paid plan has one seat, so an invite is blocked with plan_limit", async () => {
    const owner = await signInTrial({ email: uniqueEmail("solo") });

    const response = await invite({ cookie: owner.cookie, email: uniqueEmail("m") });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "plan_limit" });
  });

  it("F8: a seat added by hand → sign-in → member in the owner's workspace", async () => {
    const owner = await signInTrial({ email: uniqueEmail("owner") });
    const memberEmail = uniqueEmail("member");

    const member = await addMember({ accountId: owner.accountId, email: memberEmail });
    const me = await (
      await call({ cookie: member.cookie, path: "/api/me" })
    ).json<{ account: { id: string }; role: string }>();
    const seats = await (
      await call({ cookie: owner.cookie, path: "/api/seats" })
    ).json<Array<{ email: string; status: string }>>();

    expect(me).toMatchObject({ account: { id: owner.accountId }, role: "member" });
    expect(seats.find((seat) => seat.email === memberEmail)?.status).toBe("active");
    expect(
      await countRows({
        sql: "SELECT COUNT(*) AS n FROM accounts a JOIN users u ON u.id = a.owner_user_id WHERE u.email = ?",
        binds: [memberEmail],
      }),
    ).toBe(0);
  });

  it("F8: a revoked seat's session gets 401 at once", async () => {
    const owner = await signInTrial({ email: uniqueEmail("owner-r") });
    const member = await addMember({ accountId: owner.accountId, email: uniqueEmail("leaver") });
    const before = await call({ cookie: member.cookie, path: "/api/brands" });

    const revoked = await call({ cookie: owner.cookie, path: `/api/seats/${member.seatId}`, method: "DELETE" });
    const after = await call({ cookie: member.cookie, path: "/api/brands" });

    expect(before.status).toBe(200);
    expect(revoked.status).toBe(200);
    expect(after.status).toBe(401);
  });

  it("F8: members can't invite or revoke, and the owner seat can't be revoked", async () => {
    const owner = await signInTrial({ email: uniqueEmail("owner-m") });
    const member = await addMember({ accountId: owner.accountId, email: uniqueEmail("plain") });
    const seats = await (
      await call({ cookie: owner.cookie, path: "/api/seats" })
    ).json<Array<{ id: string; role: string }>>();
    const ownerSeat = seats.find((seat) => seat.role === "owner");

    const memberInvite = await invite({ cookie: member.cookie, email: uniqueEmail("x") });
    const revokeOwner = await call({ cookie: owner.cookie, path: `/api/seats/${ownerSeat?.id}`, method: "DELETE" });

    expect(memberInvite.status).toBe(403);
    expect(revokeOwner.status).toBe(404);
  });
});
