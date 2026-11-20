import type { BrandDto } from "@inboxsieve/contract";
import { createEffect, createEvent, createStore, sample } from "effector";
import { createGate } from "effector-react";

import { $brand, meRefreshRequested } from "../session/model";
import { apiRequest } from "../shared/api";
import { toastShown } from "../shared/toast-model";

export type AlertForm = {
  enabled: boolean;
  threshold: number;
  slackWebhookUrl: string;
  isSlackRemoved: boolean;
};

const EMPTY_FORM: AlertForm = {
  enabled: true,
  threshold: 80,
  slackWebhookUrl: "",
  isSlackRemoved: false,
};

export const AlertsGate = createGate();

export const alertFormChanged = createEvent<Partial<AlertForm>>();
export const alertsSaveClicked = createEvent();

export const $alertForm = createStore<AlertForm>(EMPTY_FORM);

export const saveAlertsFx = createEffect(({ brandId, form }: { brandId: string; form: AlertForm }) => {
  return apiRequest<BrandDto>({
    path: `/api/brands/${brandId}/alerts`,
    method: "PATCH",
    body: {
      enabled: form.enabled,
      threshold: form.threshold,
      slackWebhookUrl: buildSlackValue(form),
    },
  });
});

sample({
  clock: [AlertsGate.open, $brand],
  source: $brand,
  filter: Boolean,
  fn: (brand): AlertForm => {
    return {
      enabled: brand.alertState !== "disabled",
      threshold: brand.alertThreshold,
      slackWebhookUrl: "",
      isSlackRemoved: false,
    };
  },
  target: $alertForm,
});

sample({
  clock: alertFormChanged,
  source: $alertForm,
  fn: (form, change) => {
    return {
      ...form,
      ...change,
    };
  },
  target: $alertForm,
});

sample({
  clock: alertsSaveClicked,
  source: {
    brand: $brand,
    form: $alertForm,
  },
  filter: ({ brand }) => brand !== null,
  fn: ({ brand, form }) => {
    return {
      brandId: brand?.id ?? "",
      form,
    };
  },
  target: saveAlertsFx,
});

sample({
  clock: saveAlertsFx.done,
  target: meRefreshRequested,
});

sample({
  clock: saveAlertsFx.done,
  fn: () => {
    return {
      text: "Alert settings saved",
      tone: "success" as const,
    };
  },
  target: toastShown,
});

sample({
  clock: saveAlertsFx.failData,
  fn: (error) => {
    return {
      text: error.message,
      tone: "error" as const,
    };
  },
  target: toastShown,
});

function buildSlackValue(form: AlertForm) {
  if (form.isSlackRemoved) {
    return "";
  }
  return form.slackWebhookUrl.trim() || null;
}
