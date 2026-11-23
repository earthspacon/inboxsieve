import { PLAN_LIMITS, type SeatDto } from "@inboxsieve/contract";
import { useGate, useUnit } from "effector-react";
import { useState, type FormEvent } from "react";

import { $isOwner, $me } from "../session/model";
import { CONTACT_EMAIL } from "../site/config";
import {
  Banner,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  Card,
  ErrorState,
  INPUT,
  LoadingState,
  PageHeader,
} from "../shared/ui";
import {
  $seatPrompt,
  inviteFx,
  inviteSubmitted,
  revokeClicked,
  seatPromptClosed,
  seatsRemote,
  TeamGate,
} from "../team/model";

const SEAT_STATUS_TEXT: Record<SeatDto["status"], string> = {
  invited: "Invited",
  active: "Active",
  revoked: "Revoked",
};

export const TeamPage = () => {
  useGate(TeamGate);
  return (
    <div className="space-y-4">
      <PageHeader title="Team" subtitle="Invite teammates by email. They sign in with a magic link." />
      <SeatPrompt />
      <SeatCount />
      <SeatList />
      <InviteForm />
    </div>
  );
};

const SeatPrompt = () => {
  const { message } = useUnit({
    message: $seatPrompt,
  });

  if (!message) {
    return null;
  }
  return (
    <Banner tone="warning">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{message}. Need more? Write to us and we'll set it up.</span>
        <span className="flex gap-2">
          <a href={`mailto:${CONTACT_EMAIL}`} className={BUTTON_PRIMARY}>
            Write to us
          </a>
          <button type="button" onClick={() => seatPromptClosed()} className={BUTTON_SECONDARY}>
            Not now
          </button>
        </span>
      </div>
    </Banner>
  );
};

const SeatCount = () => {
  const { me, seats } = useUnit({
    me: $me,
    seats: seatsRemote.$data,
  });

  if (!me) {
    return null;
  }
  return (
    <p className="text-sm text-slate-600">
      {seats.length} of {PLAN_LIMITS[me.account.plan].seats} seats used
    </p>
  );
};

const SeatList = () => {
  const { seats, status, error, isOwner } = useUnit({
    seats: seatsRemote.$data,
    status: seatsRemote.$status,
    error: seatsRemote.$error,
    isOwner: $isOwner,
  });

  if (status === "loading") {
    return <LoadingState />;
  }
  if (status === "error") {
    return <ErrorState message={error} onRetry={() => seatsRemote.fx()} />;
  }
  return (
    <Card className="divide-y divide-slate-100">
      {seats.map((seat) => {
        return (
          <div key={seat.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <span className="min-w-0 truncate font-medium">{seat.email}</span>
            <span className="flex items-center gap-3 text-xs text-slate-500">
              {seat.role === "owner" ? "Owner" : SEAT_STATUS_TEXT[seat.status]}
              {isOwner && seat.role === "member" && (
                <button
                  type="button"
                  onClick={() => revokeClicked(seat.id)}
                  className="font-medium text-rose-800"
                  aria-label={`Revoke ${seat.email}`}
                >
                  Revoke
                </button>
              )}
            </span>
          </div>
        );
      })}
    </Card>
  );
};

const InviteForm = () => {
  const [email, setEmail] = useState("");
  const { isOwner, isInviting } = useUnit({
    isOwner: $isOwner,
    isInviting: inviteFx.pending,
  });

  if (!isOwner) {
    return <p className="text-sm text-slate-500">Only the workspace owner can invite or revoke seats.</p>;
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    inviteSubmitted(email);
    setEmail("");
  };

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <label className="block min-w-60 flex-1 text-sm">
          <span className="font-medium text-slate-700">Teammate email</span>
          <input
            required
            type="email"
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={INPUT}
          />
        </label>
        <button type="submit" disabled={isInviting} className={BUTTON_PRIMARY}>
          Send invite
        </button>
      </form>
    </Card>
  );
};
