import { PLAN_LIMITS } from "@inboxsieve/contract";
import { useGate, useUnit } from "effector-react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";

import { PAID_PRICE_LABEL } from "../pricing/config";
import { $alertForm, alertFormChanged, alertsSaveClicked, AlertsGate, saveAlertsFx } from "../alerts/model";
import { $brand, $plan } from "../session/model";
import { Banner, BUTTON_PRIMARY, Card, INPUT, PageHeader } from "../shared/ui";

export const AlertsPage = () => {
  useGate(AlertsGate);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Hot-lead alerts"
        subtitle="Email to every seat, plus Slack on paid plans if you add a webhook."
      />
      <AlertStateNotice />
      <AlertsForm />
    </div>
  );
};

const AlertStateNotice = () => {
  const { brand } = useUnit({ brand: $brand });

  if (brand?.alertState !== "delivery_failed") {
    return null;
  }
  return (
    <Banner tone="danger">
      The last alert failed after 3 tries: {brand.alertLastError}. Check the Slack URL and save to clear this.
    </Banner>
  );
};

const AlertsForm = () => {
  const { form, isSaving } = useUnit({
    form: $alertForm,
    isSaving: saveAlertsFx.pending,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    alertsSaveClicked();
  };

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="space-y-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => alertFormChanged({ enabled: event.target.checked })}
          />
          Send alerts for this brand
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Alert when the score is at least</span>
          <input
            type="number"
            min={0}
            max={100}
            required
            value={form.threshold}
            onChange={(event) => alertFormChanged({ threshold: Number(event.target.value) })}
            className={`${INPUT} max-w-32`}
          />
        </label>
        <SlackFields />
        <button type="submit" disabled={isSaving} className={BUTTON_PRIMARY}>
          Save alerts
        </button>
      </form>
    </Card>
  );
};

const SlackFields = () => {
  const { form, brand, plan } = useUnit({
    form: $alertForm,
    brand: $brand,
    plan: $plan,
  });

  if (!plan || !PLAN_LIMITS[plan].slackAlerts) {
    return (
      <p className="text-sm text-slate-600">
        Slack alerts come with the {PAID_PRICE_LABEL} plan.{" "}
        <Link to="/app/billing" className="font-semibold text-brand-ink underline">
          Upgrade
        </Link>
      </p>
    );
  }
  return (
    <>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Slack incoming webhook URL</span>
        <input
          type="url"
          placeholder={
            brand?.slackConfigured ? "Saved. Paste a new URL to replace it" : "https://hooks.slack.com/services/…"
          }
          value={form.slackWebhookUrl}
          onChange={(event) => alertFormChanged({ slackWebhookUrl: event.target.value })}
          className={INPUT}
        />
      </label>
      {brand?.slackConfigured && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.isSlackRemoved}
            onChange={(event) => alertFormChanged({ isSlackRemoved: event.target.checked })}
          />
          Remove the saved Slack webhook
        </label>
      )}
    </>
  );
};
