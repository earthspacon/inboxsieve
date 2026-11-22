import { useGate, useUnit } from "effector-react";
import { Lock } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { $upgradePrompt, brandCreateSubmitted, BrandsGate, createBrandFx, upgradePromptClosed } from "../billing/model";
import { $brand, $me, brandSelected } from "../session/model";
import { Banner, BUTTON_PRIMARY, BUTTON_SECONDARY, Card, INPUT, PageHeader } from "../shared/ui";

export const BrandsPage = () => {
  useGate(BrandsGate);
  return (
    <div className="space-y-4">
      <PageHeader title="Brands" subtitle="One brand per client. Each has its own sources, profile and inbox." />
      <UpgradePrompt />
      <BrandList />
      <NewBrandForm />
    </div>
  );
};

export const UpgradePrompt = () => {
  const { message } = useUnit({ message: $upgradePrompt });

  if (!message) {
    return null;
  }
  return (
    <Banner tone="warning">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{message}. Agency has 10 brands and 3 seats.</span>
        <span className="flex gap-2">
          <Link to="/app/billing" className={BUTTON_PRIMARY}>
            Upgrade
          </Link>
          <button type="button" onClick={() => upgradePromptClosed()} className={BUTTON_SECONDARY}>
            Not now
          </button>
        </span>
      </div>
    </Banner>
  );
};

const BrandList = () => {
  const { me, current } = useUnit({
    me: $me,
    current: $brand,
  });
  return (
    <Card className="divide-y divide-slate-100">
      {me?.brands.map((brand) => {
        return (
          <div key={brand.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
            <span className="flex items-center gap-2 font-medium">
              {brand.name}
              {brand.readOnly && (
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  <Lock className="size-3" />
                  Read-only on your plan
                </span>
              )}
            </span>
            {brand.id === current?.id ? (
              <span className="text-xs text-slate-500">Selected</span>
            ) : (
              <button
                type="button"
                onClick={() => brandSelected(brand.id)}
                className="text-xs font-medium text-brand-ink"
              >
                Switch
              </button>
            )}
          </div>
        );
      })}
    </Card>
  );
};

const NewBrandForm = () => {
  const [name, setName] = useState("");
  const { isCreating } = useUnit({ isCreating: createBrandFx.pending });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    brandCreateSubmitted(name);
    setName("");
  };

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <label className="block min-w-60 flex-1 text-sm">
          <span className="font-medium text-slate-700">New brand</span>
          <input
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={INPUT}
          />
        </label>
        <button type="submit" disabled={isCreating} className={BUTTON_PRIMARY}>
          Add brand
        </button>
      </form>
    </Card>
  );
};
