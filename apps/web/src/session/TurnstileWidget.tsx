import { useEffect, useRef } from "react";

import { getTurnstileTheme, loadTurnstile, TURNSTILE_SITE_KEY } from "./turnstile";

type Props = {
  onSolved: (token: string) => void;
  onExpired: () => void;
};

// Cloudflare's bot check; the token it returns goes with the request so the server can verify it.
export const TurnstileWidget = ({ onSolved, onExpired }: Props) => {
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
          theme: getTurnstileTheme(),
          callback: onSolved,
          "expired-callback": onExpired,
          "error-callback": onExpired,
        });
      })
      .catch(() => {
        onExpired();
      });

    return () => {
      isMounted = false;
      if (widgetId) {
        window.turnstile?.remove(widgetId);
      }
    };
  }, [onSolved, onExpired]);

  return <div ref={container} className="min-h-[65px]" />;
};
