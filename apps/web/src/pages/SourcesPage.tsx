import { useGate, useUnit } from "effector-react";
import { Mail, Webhook } from "lucide-react";

import { $brandId } from "../session/model";
import { SourceCard } from "../sources/SourceCard";
import { createSourceFx, sourceCreateClicked, SourcesGate, sourcesRemote } from "../sources/model";
import { BUTTON_SECONDARY, Card, ErrorState, LoadingState, PageHeader } from "../shared/ui";

export const SourcesPage = () => {
  const { brandId } = useUnit({ brandId: $brandId });
  useGate(SourcesGate, { brandId });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Sources" subtitle="Where your inquiries come from." />
        <AddButtons />
      </div>
      <SourceList brandId={brandId} />
    </div>
  );
};

export const AddButtons = () => {
  const { isCreating } = useUnit({ isCreating: createSourceFx.pending });
  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={isCreating}
        onClick={() => sourceCreateClicked("email")}
        className={BUTTON_SECONDARY}
      >
        <Mail className="size-4" />
        Forward email
      </button>
      <button
        type="button"
        disabled={isCreating}
        onClick={() => sourceCreateClicked("webhook")}
        className={BUTTON_SECONDARY}
      >
        <Webhook className="size-4" />
        Webhook
      </button>
    </div>
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
        return <SourceCard key={source.id} source={source} />;
      })}
    </div>
  );
};
