import { afterEach, describe, expect, it, vi } from "vitest";

import { getTurnstileTheme } from "./turnstile";

describe("getTurnstileTheme", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is dark while the site is dark (no theme attribute) and light once the user picked light", () => {
    const root: { dataset: { theme?: string } } = { dataset: {} };
    vi.stubGlobal("document", { documentElement: root });

    expect(getTurnstileTheme()).toBe("dark");

    root.dataset.theme = "light";
    expect(getTurnstileTheme()).toBe("light");
  });
});
