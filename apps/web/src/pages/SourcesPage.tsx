import { PLAN_LIMITS, type SourceKind } from "@inboxsieve/contract";
import { useGate, useUnit } from "effector-react";
import { Loader2, Mail, Webhook, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { $brandId, $plan } from "../session/model";
import { SourceCard } from "../sources/SourceCard";
import {
  $creatingKind,
  $isAtSourceLimit,
  $sourceCount,
  $sourceLimit,
  createSourceFx,
  sourceCreateClicked,
  SourcesGate,
  sourcesRemote,
} from "../sources/model";
import { BUTTON_SECONDARY, Card, ErrorState, LoadingState, PageHeader } from "../shared/ui";

const ADD_BUTTONS: Array<{ kind: SourceKind; label: string; Icon: LucideIcon }> = [
  {
    kind: "email",
    label: "Forward email",
    Icon: Mail,
  },
  {
    kind: "webhook",
    label: "Webhook",
    Icon: Webhook,
  },
];

export const SourcesPage = () => {
  const { brandId } = useUnit({ brandId: $brandId });
  useGate(SourcesGate, { brandId });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Sources" subtitle="Where your inquiries come from." />
        <AddButtons />
      </div>
      <PlanUsage />
      <SourceList brandId={brandId} />
    </div>
  );
};

export const AddButtons = () => {
  const { isCreating, isAtLimit, creatingKind } = useUnit({
    isCreating: createSourceFx.pending,
    isAtLimit: $isAtSourceLimit,
    creatingKind: $creatingKind,
  });
  return (
    <div className="flex gap-2">
      {ADD_BUTTONS.map(({ kind, label, Icon }) => {
        return (
          <button
            key={kind}
            type="button"
            disabled={isCreating || isAtLimit}
            onClick={() => sourceCreateClicked(kind)}
            className={`${BUTTON_SECONDARY} transition active:scale-95 active:bg-slate-100 disabled:active:scale-100`}
          >
            <AddIcon Icon={Icon} isPending={creatingKind === kind} />
            {label}
          </button>
        );
      })}
    </div>
  );
};

const AddIcon = ({ Icon, isPending }: { Icon: LucideIcon; isPending: boolean }) => {
  if (isPending) {
    return <Loader2 className="size-4 animate-spin" />;
  }
  return <Icon className="size-4" />;
};

const PlanUsage = () => {
  const { used, limit, isAtLimit, plan, status } = useUnit({
    used: $sourceCount,
    limit: $sourceLimit,
    isAtLimit: $isAtSourceLimit,
    plan: $plan,
    status: sourcesRemote.$status,
  });

  if (limit === null || status !== "ready") {
    return null;
  }
  return (
    <p className="text-sm text-slate-500">
      {used} of {limit} sources used. {isAtLimit && <LimitHint isFree={plan === "free"} />}
    </p>
  );
};

const LimitHint = ({ isFree }: { isFree: boolean }) => {
  if (!isFree) {
    return <span>Remove one to add another.</span>;
  }
  return (
    <Link to="/app/billing" className="font-semibold text-brand-ink underline">
      Get {PLAN_LIMITS.solo.sources} sources
    </Link>
  );
};

const SourceList = ({ brandId }: { brandId: string }) => {
  const { sources, status, error } = useUnit({
    sources: sourcesRemote.$data,
    status: sourcesRemote.$status,
    error: sourcesRemote.$error,
  });

  if (status === "loading") {
    return <LoadingState label="Loading sources…" />;
  }
  if (status === "error") {
    return <ErrorState message={error} onRetry={() => sourcesRemote.fx({ brandId })} />;
  }
  if (sources.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-slate-500">
        No sources yet. Forward your contact-form email or add a webhook above.
      </Card>
    );
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {sources.map((source) => {
        return (
          <div key={source.id} id={`source-${source.id}`} data-source-kind={source.kind} className="scroll-mt-4">
            <SourceCard source={source} />
          </div>
        );
      })}
    </div>
  );
};
