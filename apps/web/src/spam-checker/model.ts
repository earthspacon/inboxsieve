import { SPAM_CHECKER_API_PATH, type SpamCheckInput, type SpamCheckResultDto } from "@inboxsieve/contract";
import { createEffect, createEvent, createStore, sample } from "effector";

import { apiRequest } from "../shared/api";

export const messageChanged = createEvent<string>();
export const idealClientChanged = createEvent<string>();
export const exampleClicked = createEvent();
export const checkSubmitted = createEvent();
export const turnstileSolved = createEvent<string>();
export const turnstileExpired = createEvent();

const EXAMPLE_MESSAGE =
  "Hi, we're opening a second dental clinic in Austin in March and need a new website with online booking. Budget is around $8k. Could you send a quote and your earliest start date?";

export const checkFx = createEffect(({ input, token }: { input: SpamCheckInput; token: string }) => {
  return apiRequest<SpamCheckResultDto>({
    path: SPAM_CHECKER_API_PATH,
    method: "POST",
    headers: { "x-turnstile-token": token },
    body: input,
  });
});

export const $message = createStore("");
export const $idealClient = createStore("");
export const $result = createStore<SpamCheckResultDto | null>(null);
export const $checkError = createStore("");
export const $turnstileToken = createStore("");
// A Turnstile token works once, so every check remounts the widget for a fresh one.
export const $turnstileRound = createStore(0);

// #region form
sample({
  clock: messageChanged,
  target: $message,
});

sample({
  clock: idealClientChanged,
  target: $idealClient,
});

sample({
  clock: exampleClicked,
  fn: () => EXAMPLE_MESSAGE,
  target: $message,
});
// #endregion

// #region bot check
sample({
  clock: turnstileSolved,
  target: $turnstileToken,
});

sample({
  clock: [turnstileExpired, checkFx.finally],
  target: $turnstileToken.reinit,
});

sample({
  clock: checkFx.finally,
  source: $turnstileRound,
  fn: (round) => round + 1,
  target: $turnstileRound,
});
// #endregion

// #region check
sample({
  clock: checkSubmitted,
  source: {
    message: $message,
    idealClient: $idealClient,
    token: $turnstileToken,
  },
  filter: ({ message, token }) => message.trim() !== "" && token !== "",
  fn: ({ message, idealClient, token }) => {
    return {
      input: {
        message: message.trim(),
        idealClient: idealClient.trim(),
      },
      token,
    };
  },
  target: checkFx,
});

sample({
  clock: checkFx,
  target: [$checkError.reinit, $result.reinit],
});

sample({
  clock: checkFx.doneData,
  target: $result,
});

sample({
  clock: checkFx.failData,
  fn: (error) => error.message,
  target: $checkError,
});
// #endregion
