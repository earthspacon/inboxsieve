import { useGate, useUnit } from "effector-react";
import { Check } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";

import { Logo } from "../app/AppShell";
import { $step, OnboardingGate, stepChosen, type OnboardingStep } from "../onboarding/model";
import { ProfileForm } from "../profile/ProfileForm";
import { brandRenameSubmitted, ProfileGate, renameBrandFx } from "../profile/model";
import { $brand, $brandId, $isOwner } from "../session/model";
import { SourceCard } from "../sources/SourceCard";
import { SourcesGate, sourcesRemote } from "../sources/model";
import { BUTTON_PRIMARY, Card, INPUT } from "../shared/ui";
import { AddButtons } from "./SourcesPage";

const STEPS: { key: OnboardingStep; label: string }[] = [
  {
    key: "brand",
    label: "Brand",
  },
  {
    key: "profile",
    label: "Profile",
  },
  {
    key: "source",
    label: "First source",
  },
];

// Setup is the owner's job. An invited teammate is a new user too, so Better Auth sends them here; they go to the inbox.
export const OnboardingPage = () => {
  const { isOwner } = useUnit({ isOwner: $isOwner });

  if (!isOwner) {
    return <Navigate to="/app" replace />;
  }
  return <OwnerOnboarding />;
};

const OwnerOnboarding = () => {
  const { brandId, step } = useUnit({
    brandId: $brandId,
    step: $step,
  });
  useGate(OnboardingGate);
  useGate(ProfileGate, { brandId });
  useGate(SourcesGate, { brandId });

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <Logo to="/app" />
      <Stepper current={step} />
      {step === "brand" && <BrandStep key={brandId} />}
      {step === "profile" && <ProfileStep brandId={brandId} />}
      {step === "source" && <SourceStep />}
    </div>
  );
};

const Stepper = ({ current }: { current: OnboardingStep }) => {
  const currentIndex = STEPS.findIndex((step) => {
    return step.key === current;
  });
  return (
    <ol className="flex gap-2 text-sm">
      {STEPS.map((step, index) => {
        return (
          <li key={step.key} className="flex-1">
            <button
              type="button"
              disabled={index > currentIndex}
              onClick={() => stepChosen(step.key)}
              className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 ${index === currentIndex ? "border-brand-600 bg-brand-50 font-semibold text-brand-700" : "border-slate-200 bg-white text-slate-500"}`}
            >
              {index < currentIndex ? <Check className="size-4" /> : <span className="tabular-nums">{index + 1}</span>}
              {step.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
};

const BrandStep = () => {
  const { brand, isSaving } = useUnit({
    brand: $brand,
    isSaving: renameBrandFx.pending,
  });
  const [name, setName] = useState(brand?.name ?? "");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    brandRenameSubmitted(name);
  };

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">What's the business called?</h1>
        <p className="text-sm text-slate-500">Agencies: one brand per client. You can add more later.</p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Brand name</span>
          <input
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={INPUT}
          />
        </label>
        <button type="submit" disabled={isSaving} className={BUTTON_PRIMARY}>
          Continue
        </button>
      </form>
    </Card>
  );
};

const ProfileStep = ({ brandId }: { brandId: string }) => {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold">Tell the AI who a good lead is</h1>
        <p className="text-sm text-slate-500">It scores every inquiry against this and writes drafts in your tone.</p>
      </div>
      <ProfileForm brandId={brandId} submitLabel="Save and continue" />
      <button type="button" onClick={() => stepChosen("source")} className="text-sm text-slate-500 underline">
        Skip for now (generic scoring)
      </button>
    </div>
  );
};

const SourceStep = () => {
  const { sources } = useUnit({ sources: sourcesRemote.$data });
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold">Connect your first source</h1>
        <p className="text-sm text-slate-500">Forward your contact-form email, or point a form webhook at us.</p>
      </div>
      <AddButtons />
      {sources.map((source) => {
        return <SourceCard key={source.id} source={source} isCompact />;
      })}
      {sources.length > 0 && (
        <Link to="/app" className={BUTTON_PRIMARY}>
          Go to the inbox
        </Link>
      )}
    </div>
  );
};
