import { PLAN_LIMITS, type BillingDto } from "@inboxsieve/contract";
import { useGate, useUnit } from "effector-react";
import { Loader2 } from "lucide-react";

import {
  $checkoutError,
  $isWaitingForActivation,
  BillingGate,
  billingRemote,
  checkoutClicked,
  manageBillingClicked,
  portalFx,
  startTrialFx,
  trialStartClicked,
} from "../billing/model";
import { FREE_TAGLINE, PAID_PRICE_LABEL, PERIOD_PRICE_LABELS, TRIAL_CTA } from "../pricing/config";
import { $period } from "../pricing/model";
import { PlanCards } from "../pricing/PlanCards";
import { $isOwner } from "../session/model";
import {
  Banner,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  Card,
  ErrorState,
  formatDay,
  LoadingState,
  PageHeader,
} from "../shared/ui";

const STATUS_TEXT: Record<BillingDto["subscription"], string> = {
  no_subscription: "Free plan",
  trialing: "Trial",
  active: "Active",
  past_due: "Payment failed",
  paused: "Paused",
  canceled: "Canceled",
  expired: "Ended, on Free",
};

export const BillingPage = () => {
  useGate(BillingGate);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Billing"
        subtitle="Your plan, trial and upgrades. Card and invoices live in the Paddle portal."
      />
      <BillingView />
    </div>
  );
};

const BillingView = () => {
  const { billing, status, error, isOwner } = useUnit({
    billing: billingRemote.$data,
    status: billingRemote.$status,
    error: billingRemote.$error,
    isOwner: $isOwner,
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
      <CurrentPlan billing={billing} isOwner={isOwner} />
      {isOwner && !billing.hasPaidSubscription && <Upgrade billing={billing} />}
    </div>
  );
};

const BillingNotices = ({ billing }: { billing: BillingDto }) => {
  return (
    <>
      {billing.trialEndsAt && (
        <Banner tone="info">
          Your free trial ends on {formatDay(billing.trialEndsAt)}. There's no card on file, so nothing is charged;
          after that you're back on Free unless you upgrade.
        </Banner>
      )}
      {billing.scheduledChange?.action === "cancel" && (
        <Banner tone="warning">
          Your subscription ends on {formatDay(billing.scheduledChange.effectiveAt)}. You keep full access until then,
          then the workspace moves to Free.
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

const CurrentPlan = ({ billing, isOwner }: { billing: BillingDto; isOwner: boolean }) => {
  const { isOpening } = useUnit({ isOpening: portalFx.pending });
  const planName = billing.plan === "free" ? "Free" : PERIOD_PRICE_LABELS[billing.billingPeriod];

  return (
    <Card className="space-y-3 p-5">
      <h2 className="text-lg font-semibold">You're on the {planName} plan</h2>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <Fact label="Plan" value={planName} />
        <Fact label="Status" value={STATUS_TEXT[billing.subscription]} />
        <Fact
          label="Current period ends"
          value={billing.currentPeriodEnd ? formatDay(billing.currentPeriodEnd) : "—"}
        />
      </dl>
      {!isOwner && <p className="text-sm text-slate-500">Only the workspace owner can change billing.</p>}
      {isOwner && billing.hasCustomer && (
        <div className="space-y-2">
          <button
            type="button"
            disabled={isOpening}
            onClick={() => manageBillingClicked()}
            className={BUTTON_SECONDARY}
          >
            Manage billing
          </button>
          <p className="text-xs text-slate-500">
            Update your card, download invoices or cancel in the Paddle portal. A cancel applies at the end of the paid
            period.
          </p>
        </div>
      )}
    </Card>
  );
};

const Upgrade = ({ billing }: { billing: BillingDto }) => {
  const { checkoutError, isWaiting } = useUnit({
    checkoutError: $checkoutError,
    isWaiting: $isWaitingForActivation,
  });

  if (isWaiting) {
    return <Activating />;
  }
  return (
    <section className="space-y-4">
      {billing.canStartTrial && <TrialOffer />}
      <div>
        <h2 className="text-lg font-semibold">Upgrade: {PAID_PRICE_LABEL}</h2>
        <p className="text-sm text-slate-500">
          Paddle is the merchant of record and adds sales tax or VAT where due. {FREE_TAGLINE}
        </p>
      </div>
      {checkoutError && <Banner tone="danger">{checkoutError}</Banner>}
      {!billing.checkout.clientToken && (
        <Banner tone="warning">Checkout isn't configured on this server yet (no Paddle client token).</Banner>
      )}
      <PlanCards
        renderAction={(plan) => {
          if (plan === "free") {
            return null;
          }
          return <UpgradeButton />;
        }}
      />
    </section>
  );
};

const UpgradeButton = () => {
  const { period } = useUnit({
    period: $period,
  });

  return (
    <button type="button" onClick={() => checkoutClicked()} className={`${BUTTON_PRIMARY} min-h-11 w-full`}>
      Upgrade for {PERIOD_PRICE_LABELS[period]}
    </button>
  );
};

const TrialOffer = () => {
  const { isStarting } = useUnit({ isStarting: startTrialFx.pending });

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <h2 className="text-lg font-semibold">Try the paid plan free</h2>
        <p className="text-sm text-slate-600">
          Unlimited sources, {PLAN_LIMITS.solo.leadsPerMonth} leads a month and Slack alerts. No card needed, one trial
          per workspace.
        </p>
      </div>
      <button type="button" disabled={isStarting} onClick={() => trialStartClicked()} className={BUTTON_PRIMARY}>
        {TRIAL_CTA}
      </button>
    </Card>
  );
};

const Activating = () => {
  return (
    <Banner tone="info">
      <span className="inline-flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" />
        Payment received. Upgrading your workspace…
      </span>
    </Banner>
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
