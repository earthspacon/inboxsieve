import { useUnit } from "effector-react";
import { MailCheck } from "lucide-react";
import { useEffect, useRef, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { Logo } from "../app/AppShell";
import {
  $email,
  $sendError,
  $sentTo,
  $turnstileRound,
  $turnstileToken,
  anotherEmailClicked,
  emailChanged,
  sendLinkFx,
  signInSubmitted,
  turnstileExpired,
  turnstileSolved,
} from "../session/sign-in-model";
import { loadTurnstile, TURNSTILE_SITE_KEY } from "../session/turnstile";
import { Banner, BUTTON_PRIMARY, Card, INPUT } from "../shared/ui";

export const SignInPage = () => {
  const { sentTo } = useUnit({ sentTo: $sentTo });
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-10">
      <Logo to="/" />
      {sentTo ? <LinkSent email={sentTo} /> : <SignInForm />}
    </div>
  );
};

const SignInForm = () => {
  const { email, error, isSending, round, token } = useUnit({
    email: $email,
    error: $sendError,
    isSending: sendLinkFx.pending,
    round: $turnstileRound,
    token: $turnstileToken,
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
        <h1 className="text-xl font-semibold">Sign in or start free</h1>
        <p className="text-sm text-slate-500">We email you a sign-in link. No password, no card.</p>
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
        <TurnstileWidget key={round} />
        <button type="submit" disabled={isSending || !token} className={`${BUTTON_PRIMARY} w-full`}>
          {linkError ? "Send a new link" : "Email me a sign-in link"}
        </button>
      </form>
    </Card>
  );
};

// Cloudflare's bot check; the token it returns goes with the request so the server can verify it.
const TurnstileWidget = () => {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let widgetId = "";
    let isMounted = true;

    loadTurnstile()
      .then((turnstile) => {
        if (!isMounted || !container.current) {
          return;
        }
        widgetId = turnstile.render(container.current, {
          sitekey: TURNSTILE_SITE_KEY,
          size: "flexible",
          callback: turnstileSolved,
          "expired-callback": turnstileExpired,
          "error-callback": turnstileExpired,
        });
      })
      .catch(() => {
        turnstileExpired();
      });

    return () => {
      isMounted = false;
      if (widgetId) {
        window.turnstile?.remove(widgetId);
      }
    };
  }, []);

  return <div ref={container} className="min-h-[65px]" />;
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
