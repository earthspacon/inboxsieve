import { useUnit } from "effector-react";
import { MailCheck } from "lucide-react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { Logo } from "../app/AppShell";
import {
  $email,
  $sendError,
  $sentTo,
  anotherEmailClicked,
  emailChanged,
  sendLinkFx,
  signInSubmitted,
} from "../session/sign-in-model";
import { Banner, BUTTON_PRIMARY, Card, INPUT } from "../shared/ui";

export const SignInPage = () => {
  const { sentTo } = useUnit({ sentTo: $sentTo });
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-10">
      <Logo />
      {sentTo ? <LinkSent email={sentTo} /> : <SignInForm />}
    </div>
  );
};

const SignInForm = () => {
  const { email, error, isSending } = useUnit({
    email: $email,
    error: $sendError,
    isSending: sendLinkFx.pending,
  });
  const [searchParams] = useSearchParams();
  const linkError = searchParams.get("error");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    signInSubmitted();
  };

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Sign in or start your trial</h1>
        <p className="text-sm text-slate-500">We email you a sign-in link. No password.</p>
      </div>
      {linkError && (
        <Banner tone="warning">That sign-in link expired or was already used. Send a new link below.</Banner>
      )}
      {error && <Banner tone="danger">{error}</Banner>}
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Work email</span>
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => emailChanged(event.target.value)}
            className={INPUT}
          />
        </label>
        <button type="submit" disabled={isSending} className={`${BUTTON_PRIMARY} w-full`}>
          {linkError ? "Send a new link" : "Email me a sign-in link"}
        </button>
      </form>
    </Card>
  );
};

const LinkSent = ({ email }: { email: string }) => {
  return (
    <Card className="space-y-3 p-6 text-center">
      <MailCheck className="mx-auto size-8 text-brand-600" />
      <h1 className="text-xl font-semibold">Check your email</h1>
      <p className="text-sm text-slate-600">
        We sent a sign-in link to <span className="font-medium">{email}</span>. It works once and expires in 15 minutes.
      </p>
      <button type="button" onClick={() => anotherEmailClicked()} className="text-sm font-medium text-brand-700">
        Use another email
      </button>
    </Card>
  );
};
