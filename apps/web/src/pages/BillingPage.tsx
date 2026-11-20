import type { BillingDto } from "@inboxsieve/contract";
import { useGate, useUnit } from "effector-react";

import { BillingGate, billingRemote, manageBillingClicked, portalFx } from "../billing/model";
import { PLAN_NAMES } from "../pricing/config";
import { $isOwner } from "../session/model";
import { Banner, BUTTON_PRIMARY, Card, ErrorState, formatDay, LoadingState, PageHeader } from "../shared/ui";

const STATUS_TEXT: Record<BillingDto["subscription"], string> = {
  no_subscription: "No subscription",
  trialing: "Trial",
  active: "Active",
  past_due: "Payment failed",
  paused: "Paused",
  canceled: "Canceled",
  expired: "Expired",
};

export const BillingPage = () => {
  useGate(BillingGate);
  return (
    <div className="space-y-4">
      <PageHeader title="Billing" subtitle="Plans, card and invoices live in the Paddle customer portal." />
      <BillingView />
    </div>
  );
};

const BillingView = () => {
  const { billing, status, error, isOwner, isOpening } = useUnit({
    billing: billingRemote.$data,
    status: billingRemote.$status,
    error: billingRemote.$error,
    isOwner: $isOwner,
    isOpening: portalFx.pending,
  });

  if (status === "loading") {
    return <LoadingState />;
  }
  if (status === "error" || !billing) {
    return <ErrorState message={error} onRetry={() => billingRemote.fx()} />;
  }
  return (
    <div className="space-y-4">
      <BillingNotices billing={billing} />
      <Card className="space-y-3 p-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <Fact label="Plan" value={PLAN_NAMES[billing.plan]} />
          <Fact label="Status" value={STATUS_TEXT[billing.subscription]} />
          <Fact
            label="Current period ends"
            value={billing.currentPeriodEnd ? formatDay(billing.currentPeriodEnd) : "—"}
          />
        </dl>
        {isOwner ? (
          <button
            type="button"
            disabled={isOpening || !billing.hasCustomer}
            onClick={() => manageBillingClicked()}
            className={BUTTON_PRIMARY}
          >
            Manage billing
          </button>
        ) : (
          <p className="text-sm text-slate-500">Only the workspace owner can change billing.</p>
        )}
        <p className="text-xs text-slate-500">
          Change plan, update your card or cancel in the Paddle portal. Upgrades apply at once with proration; a
          downgrade applies at the end of the paid period.
        </p>
      </Card>
    </div>
  );
};

const BillingNotices = ({ billing }: { billing: BillingDto }) => {
  return (
    <>
      {billing.pendingPlan && billing.currentPeriodEnd && (
        <Banner tone="info">
          You move to {PLAN_NAMES[billing.pendingPlan]} on {formatDay(billing.currentPeriodEnd)}. Brands over its limit
          turn read-only then.
        </Banner>
      )}
      {billing.scheduledChange?.action === "cancel" && (
        <Banner tone="warning">
          Your subscription ends on {formatDay(billing.scheduledChange.effectiveAt)}. You keep full access until then.
        </Banner>
      )}
      {billing.isAnalysisPaused && (
        <Banner tone="danger">
          The payment has failed for over 7 days, so analysis is paused. New leads are still stored. Update your card to
          resume.
        </Banner>
      )}
    </>
  );
};

const Fact = ({ label, value }: { label: string; value: string }) => {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
};
