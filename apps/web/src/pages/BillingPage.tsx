import { PLAN_LIMITS, type BillingDto, type Plan } from "@inboxsieve/contract";
import { useGate, useUnit } from "effector-react";
import { Loader2 } from "lucide-react";

import {
  $checkoutError,
  $interval,
  $isWaitingForActivation,
  BillingGate,
  billingRemote,
  checkoutClicked,
  intervalChosen,
  manageBillingClicked,
  portalFx,
  startTrialFx,
  trialStartClicked,
} from "../billing/model";
import { FREE_TAGLINE, PLAN_NAMES, TRIAL_CTA } from "../pricing/config";
import { IntervalToggle, PlanCards } from "../pricing/PlanCards";
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

const CURRENT_PLAN_TEXT: Record<Plan, string> = {
  free: "You're on the Free plan",
  solo: "You're on Solo",
  agency: "You're on Agency",
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
          Your Solo trial ends on {formatDay(billing.trialEndsAt)}. There's no card on file, so nothing is charged;
          after that you're back on Free unless you upgrade.
        </Banner>
      )}
      {billing.pendingPlan && billing.currentPeriodEnd && (
        <Banner tone="info">
          You move to {PLAN_NAMES[billing.pendingPlan]} on {formatDay(billing.currentPeriodEnd)}. Brands over its limit
          turn read-only then.
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

  return (
    <Card className="space-y-3 p-5">
      <h2 className="text-lg font-semibold">{CURRENT_PLAN_TEXT[billing.plan]}</h2>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <Fact label="Plan" value={PLAN_NAMES[billing.plan]} />
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
            Change plan, update your card or cancel in the Paddle portal. Upgrades apply at once with proration; a
            downgrade applies at the end of the paid period.
          </p>
        </div>
      )}
    </Card>
  );
};

const Upgrade = ({ billing }: { billing: BillingDto }) => {
  const { interval, checkoutError, isWaiting } = useUnit({
    interval: $interval,
    checkoutError: $checkoutError,
    isWaiting: $isWaitingForActivation,
  });

  if (isWaiting) {
    return <Activating />;
  }
  return (
    <section className="space-y-4">
      {billing.canStartTrial && <TrialOffer />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Upgrade</h2>
          <p className="text-sm text-slate-500">
            Paddle is the merchant of record and adds sales tax or VAT where due. {FREE_TAGLINE}
          </p>
        </div>
        <IntervalToggle interval={interval} onChange={intervalChosen} />
      </div>
      {checkoutError && <Banner tone="danger">{checkoutError}</Banner>}
      {!billing.checkout.clientToken && (
        <Banner tone="warning">Checkout isn't configured on this server yet (no Paddle client token).</Banner>
      )}
      <PlanCards
        interval={interval}
        renderAction={(plan) => {
          if (plan === "free") {
            return null;
          }
          return (
            <button type="button" onClick={() => checkoutClicked(plan)} className={`${BUTTON_PRIMARY} w-full`}>
              Upgrade to {PLAN_NAMES[plan]}
            </button>
          );
        }}
      />
    </section>
  );
};

const TrialOffer = () => {
  const { isStarting } = useUnit({ isStarting: startTrialFx.pending });

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <h2 className="text-lg font-semibold">Try Solo free</h2>
        <p className="text-sm text-slate-600">
          {PLAN_LIMITS.solo.sources} sources, {PLAN_LIMITS.solo.leadsPerMonth} leads a month and Slack alerts. No card
          needed, one trial per workspace.
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
