import type { BillingDto } from "@inboxsieve/contract";

type PaddleEvent = { name?: string };

type PaddleJs = {
  Environment: { set: (environment: "sandbox") => void };
  Initialize: (options: { token: string; eventCallback: (event: PaddleEvent) => void }) => void;
  Checkout: {
    open: (options: {
      items: Array<{ priceId: string; quantity: number }>;
      customer: { email: string };
      customData: { account_id: string };
      settings: { displayMode: "overlay"; theme: "light"; locale: "en" };
    }) => void;
  };
};

declare global {
  interface Window {
    Paddle?: PaddleJs;
  }
}

// Paddle.js v2 for Paddle Billing (not Paddle Classic).
const PADDLE_JS_URL = "https://cdn.paddle.com/paddle/v2/paddle.js";

export async function loadPaddle({
  checkout,
  onEvent,
}: {
  checkout: BillingDto["checkout"];
  onEvent: (name: string) => void;
}) {
  if (!checkout.clientToken) {
    throw new Error("Checkout isn't configured on this server yet");
  }
  if (!window.Paddle) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = PADDLE_JS_URL;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Couldn't load Paddle checkout"));
      document.head.append(script);
    });
  }
  const paddle = window.Paddle;
  if (!paddle) {
    throw new Error("Couldn't load Paddle checkout");
  }
  if (checkout.environment === "sandbox") {
    paddle.Environment.set("sandbox");
  }
  paddle.Initialize({
    token: checkout.clientToken,
    eventCallback: (event) => {
      onEvent(event.name ?? "");
    },
  });
  return paddle;
}

export function openPaddleCheckout({
  paddle,
  priceId,
  email,
  accountId,
}: {
  paddle: PaddleJs;
  priceId: string;
  email: string;
  accountId: string;
}) {
  paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customer: { email },
    customData: { account_id: accountId },
    settings: {
      displayMode: "overlay",
      theme: "light",
      locale: "en",
    },
  });
}
