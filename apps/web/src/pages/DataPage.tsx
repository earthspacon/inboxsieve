import { DELETE_ACCOUNT_CONFIRMATION } from "@inboxsieve/contract";
import { useUnit } from "effector-react";
import { Download } from "lucide-react";
import type { FormEvent } from "react";

import {
  $accountConfirm,
  $brandConfirm,
  accountConfirmChanged,
  accountDeleteClicked,
  brandConfirmChanged,
  brandDeleteClicked,
  deleteAccountFx,
  deleteBrandFx,
} from "../data/model";
import { $brand, $isOwner, $me } from "../session/model";
import { BUTTON_DANGER, BUTTON_SECONDARY, Card, INPUT, PageHeader } from "../shared/ui";

export const DataPage = () => {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Your data"
        subtitle="Raw message bodies are purged after 90 days. Parsed fields stay until you delete them."
      />
      <ExportCard />
      <OwnerZone />
    </div>
  );
};

const ExportCard = () => {
  const { brand } = useUnit({
    brand: $brand,
  });

  if (!brand) {
    return null;
  }
  return (
    <Card className="space-y-3 p-5">
      <h2 className="font-semibold">Export leads</h2>
      <p className="text-sm text-slate-600">One CSV with every lead of {brand.name}, analysis and drafts included.</p>
      <a href={`/api/brands/${brand.id}/export.csv`} download className={BUTTON_SECONDARY}>
        <Download className="size-4" />
        Download CSV
      </a>
    </Card>
  );
};

const OwnerZone = () => {
  const { isOwner } = useUnit({
    isOwner: $isOwner,
  });

  if (!isOwner) {
    return <p className="text-sm text-slate-500">Only the workspace owner can delete brands or the workspace.</p>;
  }
  return (
    <>
      <DeleteBrandCard />
      <DeleteAccountCard />
    </>
  );
};

const DeleteBrandCard = () => {
  const { brand, me, confirm, isDeleting } = useUnit({
    brand: $brand,
    me: $me,
    confirm: $brandConfirm,
    isDeleting: deleteBrandFx.pending,
  });

  if (!brand || !me || me.brands.length < 2) {
    return null;
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    brandDeleteClicked();
  };

  return (
    <Card className="space-y-3 p-5">
      <h2 className="font-semibold">Delete brand {brand.name}</h2>
      <p className="text-sm text-slate-600">
        Its sources, leads and feedback are deleted at once. This can't be undone.
      </p>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <label className="block min-w-60 flex-1 text-sm">
          <span className="font-medium text-slate-700">Type {brand.name} to confirm</span>
          <input value={confirm} onChange={(event) => brandConfirmChanged(event.target.value)} className={INPUT} />
        </label>
        <button type="submit" disabled={isDeleting || confirm !== brand.name} className={BUTTON_DANGER}>
          Delete brand
        </button>
      </form>
    </Card>
  );
};

const DeleteAccountCard = () => {
  const { confirm, isDeleting } = useUnit({
    confirm: $accountConfirm,
    isDeleting: deleteAccountFx.pending,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    accountDeleteClicked();
  };

  return (
    <Card className="space-y-3 border-rose-200 p-5">
      <h2 className="font-semibold text-rose-800">Delete workspace</h2>
      <p className="text-sm text-slate-600">
        Every brand, source, lead and seat is erased within 24 hours and every teammate is signed out now. Your Paddle
        subscription is canceled. Export first if you need the data.
      </p>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <label className="block min-w-60 flex-1 text-sm">
          <span className="font-medium text-slate-700">Type {DELETE_ACCOUNT_CONFIRMATION} to confirm</span>
          <input value={confirm} onChange={(event) => accountConfirmChanged(event.target.value)} className={INPUT} />
        </label>
        <button
          type="submit"
          disabled={isDeleting || confirm !== DELETE_ACCOUNT_CONFIRMATION}
          className={BUTTON_DANGER}
        >
          Delete workspace
        </button>
      </form>
    </Card>
  );
};
