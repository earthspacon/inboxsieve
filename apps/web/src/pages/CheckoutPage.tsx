import { useGate, useUnit } from "effector-react";
import { Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";

import { Logo } from "../app/AppShell";
import {
  $checkoutError,
  $interval,
  $isWaitingForActivation,
  BillingGate,
  billingRemote,
  checkoutClicked,
  intervalChosen,
} from "../billing/model";
import { IntervalToggle, PlanCards } from "../pricing/PlanCards";
import { $me, signOutClicked } from "../session/model";
import { Banner, BUTTON_PRIMARY, ErrorState, LoadingState } from "../shared/ui";

export const CheckoutPage = () => {
  const { me, isWaiting } = useUnit({
    me: $me,
    isWaiting: $isWaitingForActivation,
  });
  useGate(BillingGate);

  if (me && me.account.access !== "locked") {
    return <Navigate to="/app/onboarding" replace />;
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <Logo />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Finish checkout to start your 7-day trial</h1>
        <p className="text-sm text-slate-600">
          Signed in as {me?.user.email}. A card is required; you're charged after 7 days unless you cancel. Paddle is
          the merchant of record and adds sales tax or VAT where due.
        </p>
      </div>
      {isWaiting ? <Activating /> : <PlanPicker />}
      <button type="button" onClick={() => signOutClicked()} className="text-sm text-slate-500 underline">
        Sign out
      </button>
    </div>
  );
};

const Activating = () => {
  return (
    <Banner tone="info">
      <span className="inline-flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" />
        Payment received. Unlocking your workspace…
      </span>
    </Banner>
  );
};

const PlanPicker = () => {
  const { billing, status, error, interval, checkoutError } = useUnit({
    billing: billingRemote.$data,
    status: billingRemote.$status,
    error: billingRemote.$error,
    interval: $interval,
    checkoutError: $checkoutError,
  });

  if (status === "loading") {
    return <LoadingState />;
  }
  if (status === "error" || !billing) {
    return <ErrorState message={error} onRetry={() => billingRemote.fx()} />;
  }
  return (
    <div className="space-y-4">
      {checkoutError && <Banner tone="danger">{checkoutError}</Banner>}
      {!billing.checkout.clientToken && (
        <Banner tone="warning">Checkout isn't configured on this server yet (no Paddle client token).</Banner>
      )}
      <IntervalToggle interval={interval} onChange={intervalChosen} />
      <PlanCards
        interval={interval}
        renderAction={(plan) => {
          return (
            <button type="button" onClick={() => checkoutClicked(plan)} className={`${BUTTON_PRIMARY} w-full`}>
              Start 7-day trial
            </button>
          );
        }}
      />
    </div>
  );
};
