import { createEvent, createStore, sample } from "effector";
import { createGate } from "effector-react";

import { renameBrandFx, saveProfileFx } from "../profile/model";

export type OnboardingStep = "brand" | "profile" | "source";

export const OnboardingGate = createGate();

export const stepChosen = createEvent<OnboardingStep>();

export const $step = createStore<OnboardingStep>("brand");

sample({
  clock: OnboardingGate.open,
  target: $step.reinit,
});

sample({
  clock: stepChosen,
  target: $step,
});

sample({
  clock: renameBrandFx.done,
  source: OnboardingGate.status,
  filter: Boolean,
  fn: (): OnboardingStep => "profile",
  target: $step,
});

sample({
  clock: saveProfileFx.done,
  source: OnboardingGate.status,
  filter: Boolean,
  fn: (): OnboardingStep => "source",
  target: $step,
});
