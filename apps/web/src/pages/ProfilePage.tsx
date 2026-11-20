import { useGate, useUnit } from "effector-react";
import { useState, type FormEvent } from "react";

import { ProfileForm } from "../profile/ProfileForm";
import { $isRescoreOffered, brandRenameSubmitted, ProfileGate, profileRemote, rescoreClicked } from "../profile/model";
import { $brand, $brandId } from "../session/model";
import { Banner, BUTTON_SECONDARY, Card, INPUT, PageHeader } from "../shared/ui";

export const ProfilePage = () => {
  const { brandId } = useUnit({ brandId: $brandId });
  useGate(ProfileGate, { brandId });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Business profile"
        subtitle="Leads are scored against this. The better it is, the better the scores."
      />
      <ProfileNotices />
      <BrandNameCard key={brandId} />
      <ProfileForm brandId={brandId} submitLabel="Save profile" />
    </div>
  );
};

const ProfileNotices = () => {
  const { profile, isRescoreOffered } = useUnit({
    profile: profileRemote.$data,
    isRescoreOffered: $isRescoreOffered,
  });

  if (isRescoreOffered) {
    return (
      <Banner tone="info">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Profile saved. Want the last 50 leads scored again with it?</span>
          <button type="button" onClick={() => rescoreClicked()} className={BUTTON_SECONDARY}>
            Re-score last 50 leads
          </button>
        </div>
      </Banner>
    );
  }
  if (profile?.state === "defaults") {
    return (
      <Banner tone="warning">
        Improve accuracy: you're on generic scoring. Describe your services and ideal client below.
      </Banner>
    );
  }
  return null;
};

const BrandNameCard = () => {
  const { brand } = useUnit({ brand: $brand });
  const [name, setName] = useState(brand?.name ?? "");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    brandRenameSubmitted(name);
  };

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <label className="block min-w-60 flex-1 text-sm">
          <span className="font-medium text-slate-700">Brand name</span>
          <input
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={INPUT}
          />
        </label>
        <button type="submit" className={BUTTON_SECONDARY}>
          Rename
        </button>
      </form>
    </Card>
  );
};
