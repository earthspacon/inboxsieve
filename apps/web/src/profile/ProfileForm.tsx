import type { BusinessProfile } from "@inboxsieve/contract";
import { useUnit } from "effector-react";
import type { FormEvent } from "react";

import { BUTTON_PRIMARY, Card, ErrorState, INPUT, LoadingState } from "../shared/ui";
import { $profileForm, profileFieldChanged, profileRemote, profileSaveClicked, saveProfileFx } from "./model";

const FIELDS: { key: keyof BusinessProfile; label: string; hint: string; isLong: boolean }[] = [
  {
    key: "services",
    label: "Services you sell",
    hint: "e.g. Webflow sites, SEO retainers, brand identity",
    isLong: true,
  },
  {
    key: "idealClient",
    label: "Ideal client",
    hint: "e.g. B2B SaaS, 10–200 people, US/UK",
    isLong: true,
  },
  {
    key: "minBudget",
    label: "Minimum budget",
    hint: "e.g. $5,000",
    isLong: false,
  },
  {
    key: "tone",
    label: "Reply tone",
    hint: "e.g. friendly, short, no jargon",
    isLong: false,
  },
  {
    key: "signature",
    label: "Signature",
    hint: "e.g. Alex, Acme Studio",
    isLong: false,
  },
  {
    key: "bookingLink",
    label: "Booking link",
    hint: "Offered to hot and warm leads",
    isLong: false,
  },
];

export const ProfileForm = ({ brandId, submitLabel }: { brandId: string; submitLabel: string }) => {
  const { form, status, error, isSaving } = useUnit({
    form: $profileForm,
    status: profileRemote.$status,
    error: profileRemote.$error,
    isSaving: saveProfileFx.pending,
  });

  if (status === "loading") {
    return <LoadingState label="Loading profile…" />;
  }
  if (status === "error" || !form) {
    return <ErrorState message={error || "Profile not found"} onRetry={() => profileRemote.fx({ brandId })} />;
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    profileSaveClicked();
  };

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="grid gap-3 lg:grid-cols-2">
        {FIELDS.map((field) => {
          return (
            <label key={field.key} className={`block text-sm ${field.isLong ? "lg:col-span-2" : ""}`}>
              <span className="font-medium text-slate-700">{field.label}</span>
              {field.isLong ? (
                <textarea
                  rows={2}
                  maxLength={2000}
                  placeholder={field.hint}
                  value={form[field.key]}
                  onChange={(event) => profileFieldChanged({ [field.key]: event.target.value })}
                  className={INPUT}
                />
              ) : (
                <input
                  maxLength={2000}
                  placeholder={field.hint}
                  value={form[field.key]}
                  onChange={(event) => profileFieldChanged({ [field.key]: event.target.value })}
                  className={INPUT}
                />
              )}
            </label>
          );
        })}
        <div className="lg:col-span-2">
          <button type="submit" disabled={isSaving} className={BUTTON_PRIMARY}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Card>
  );
};
