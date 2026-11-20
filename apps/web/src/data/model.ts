import { DELETE_ACCOUNT_CONFIRMATION } from "@inboxsieve/contract";
import { createEffect, createEvent, createStore, sample } from "effector";

import { $brandId, $me, meRefreshRequested, signOutFx } from "../session/model";
import { apiCommand, apiRequest } from "../shared/api";
import { toastShown } from "../shared/toast-model";

export const brandConfirmChanged = createEvent<string>();
export const accountConfirmChanged = createEvent<string>();
export const brandDeleteClicked = createEvent();
export const accountDeleteClicked = createEvent();

export const $brandConfirm = createStore("");
export const $accountConfirm = createStore("");

export const deleteBrandFx = createEffect(({ brandId, confirm }: { brandId: string; confirm: string }) => {
  return apiCommand({
    path: `/api/brands/${brandId}`,
    method: "DELETE",
    body: { confirm },
  });
});

export const deleteAccountFx = createEffect(() => {
  return apiRequest<{ scheduled: boolean }>({
    path: "/api/account",
    method: "DELETE",
    body: { confirm: DELETE_ACCOUNT_CONFIRMATION },
  });
});

sample({
  clock: brandConfirmChanged,
  target: $brandConfirm,
});

sample({
  clock: accountConfirmChanged,
  target: $accountConfirm,
});

sample({
  clock: brandDeleteClicked,
  source: {
    brandId: $brandId,
    confirm: $brandConfirm,
  },
  target: deleteBrandFx,
});

sample({
  clock: deleteBrandFx.done,
  target: [meRefreshRequested, $brandConfirm.reinit],
});

sample({
  clock: deleteBrandFx.done,
  fn: () => {
    return {
      text: "Brand deleted",
      tone: "success" as const,
    };
  },
  target: toastShown,
});

sample({
  clock: accountDeleteClicked,
  source: $accountConfirm,
  filter: (confirm) => confirm === DELETE_ACCOUNT_CONFIRMATION,
  target: deleteAccountFx,
});

sample({
  clock: deleteAccountFx.done,
  fn: () => {
    return {
      text: "Workspace deleted. Every row is erased within the hour, then we email you.",
      tone: "success" as const,
    };
  },
  target: toastShown,
});

sample({
  clock: deleteAccountFx.done,
  target: [$me.reinit, signOutFx],
});

sample({
  clock: [deleteBrandFx.failData, deleteAccountFx.failData],
  fn: (error) => {
    return {
      text: error.message,
      tone: "error" as const,
    };
  },
  target: toastShown,
});
