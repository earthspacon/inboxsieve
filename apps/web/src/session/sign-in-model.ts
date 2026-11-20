import { createEffect, createEvent, createStore, sample } from "effector";

import { apiRequest } from "../shared/api";

export const emailChanged = createEvent<string>();
export const signInSubmitted = createEvent();
export const anotherEmailClicked = createEvent();

export const sendLinkFx = createEffect((email: string) => {
  return apiRequest<{ status: boolean }>({
    path: "/api/auth/sign-in/magic-link",
    method: "POST",
    body: {
      email,
      callbackURL: "/app",
      errorCallbackURL: "/sign-in",
    },
  });
});

export const $email = createStore("");
export const $sentTo = createStore("");
export const $sendError = createStore("");

sample({
  clock: emailChanged,
  target: $email,
});

sample({
  clock: signInSubmitted,
  source: $email,
  fn: (email) => email.trim(),
  filter: (email) => email.trim().includes("@"),
  target: sendLinkFx,
});

sample({
  clock: sendLinkFx,
  target: $sendError.reinit,
});

sample({
  clock: sendLinkFx.done,
  fn: ({ params }) => params,
  target: $sentTo,
});

sample({
  clock: sendLinkFx.failData,
  fn: (error) => error.message,
  target: $sendError,
});

sample({
  clock: anotherEmailClicked,
  target: $sentTo.reinit,
});
