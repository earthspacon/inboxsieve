import { PLAN_LIMITS } from "@inboxsieve/contract";

import { createAuth } from "../auth";
import { HttpError, json, readJson, readString, route, type Route } from "../http";
import { inviteSeat, listSeats, revokeSeat } from "../repo";
import { readParam, requireOwner, type ApiContext } from "./context";

const EMAIL_MAX_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const teamRoutes: Route<ApiContext>[] = [
  route("GET", "/api/seats", async ({ deps, account }) => {
    return json(await listSeats({ db: deps.db, accountId: account.accountId }));
  }),

  route("POST", "/api/seats", async ({ deps, account, request }) => {
    requireOwner(account);
    const email = readString({ data: await readJson(request), key: "email", maxLength: EMAIL_MAX_LENGTH })
      .trim()
      .toLowerCase();

    if (!EMAIL_PATTERN.test(email)) {
      throw new HttpError(400, "invalid_field", '"email" must be an email address');
    }
    const seats = await listSeats({ db: deps.db, accountId: account.accountId });
    if (seats.length >= PLAN_LIMITS[account.plan].seats) {
      throw new HttpError(403, "plan_limit", "Your plan has no room for another seat");
    }
    const seat = await inviteSeat({ db: deps.db, accountId: account.accountId, email, now: deps.now() });
    if (!seat) {
      throw new HttpError(409, "conflict", "This person is already on the team");
    }

    await createAuth({ env: deps.env, mailer: deps.mailer }).api.signInMagicLink({
      body: {
        email,
        callbackURL: "/app",
        errorCallbackURL: "/sign-in",
      },
      headers: request.headers,
    });
    return json(seat, 201);
  }),

  route("DELETE", "/api/seats/:seatId", async ({ deps, account, params }) => {
    requireOwner(account);
    const seat = await revokeSeat({
      db: deps.db,
      accountId: account.accountId,
      seatId: readParam({ params, key: "seatId" }),
    });

    if (!seat) {
      throw new HttpError(404, "not_found", "Seat not found");
    }
    return json(seat);
  }),
];
