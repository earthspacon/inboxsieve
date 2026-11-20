import type { SeatDto } from "@inboxsieve/contract";
import { createEffect, createEvent, createStore, sample } from "effector";
import { createGate } from "effector-react";

import { apiRequest, ApiRequestError } from "../shared/api";
import { createRemote } from "../shared/remote";
import { toastShown } from "../shared/toast-model";

export const TeamGate = createGate();

export const inviteSubmitted = createEvent<string>();
export const revokeClicked = createEvent<string>();
export const seatPromptClosed = createEvent();

export const seatsRemote = createRemote<void, SeatDto[]>({
  handler: () => {
    return apiRequest<SeatDto[]>({ path: "/api/seats" });
  },
  initial: [],
});

export const inviteFx = createEffect((email: string) => {
  return apiRequest<SeatDto>({
    path: "/api/seats",
    method: "POST",
    body: { email },
  });
});

const revokeFx = createEffect((seatId: string) => {
  return apiRequest<SeatDto>({
    path: `/api/seats/${seatId}`,
    method: "DELETE",
  });
});

export const $seatPrompt = createStore("");

sample({
  clock: [TeamGate.open, inviteFx.done, revokeFx.done],
  target: seatsRemote.fx,
});

sample({
  clock: inviteSubmitted,
  target: [inviteFx, $seatPrompt.reinit],
});

sample({
  clock: revokeClicked,
  target: revokeFx,
});

sample({
  clock: inviteFx.doneData,
  fn: (seat) => {
    return {
      text: `Invite sent to ${seat.email}`,
      tone: "success" as const,
    };
  },
  target: toastShown,
});

sample({
  clock: inviteFx.failData,
  filter: (error) => error instanceof ApiRequestError && error.code === "plan_limit",
  fn: (error) => error.message,
  target: $seatPrompt,
});

sample({
  clock: [inviteFx.failData, revokeFx.failData],
  filter: (error) => !(error instanceof ApiRequestError && error.code === "plan_limit"),
  fn: (error) => {
    return {
      text: error.message,
      tone: "error" as const,
    };
  },
  target: toastShown,
});

sample({
  clock: seatPromptClosed,
  target: $seatPrompt.reinit,
});
