import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { Logo } from "../app/AppShell";
import { ThemeToggle } from "../shared/ThemeToggle";
import { BUTTON_PRIMARY, PHONE_TAP, TAP_TARGET } from "../shared/ui";
import { CONTACT_EMAIL, FOOTER_LINKS, SELLER_LEGAL_NAME, START_CTA, STUDIO_URL } from "./config";
import { findSeoPage } from "./seo";
import { SessionLink } from "./SessionLink";

export const SiteLayout = ({ children }: { children: ReactNode }) => {
  const { pathname } = useLocation();

  // The prerendered HTML has the right <title>; this keeps it right after in-app navigation.
  useEffect(() => {
    const page = findSeoPage(pathname);
    if (page) {
      document.title = page.title;
    }
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2 sm:py-3">
          <Logo to="/" />
          {/* Phones keep the logo, Sign in and Start free; Pricing and the theme toggle move to the footer. */}
          <nav className="flex items-center gap-2 text-sm whitespace-nowrap sm:gap-4">
            <Link to="/pricing" className={`${TAP_TARGET} text-slate-600 hover:text-slate-900 max-sm:hidden`}>
              Pricing
            </Link>
            <SessionLink
              signedOutLabel="Sign in"
              align="end"
              className={`${TAP_TARGET} ${PHONE_TAP} px-1 text-slate-600 hover:text-slate-900`}
            />
            <span className="max-sm:hidden">
              <ThemeToggle />
            </span>
            <Link to="/sign-in" className={BUTTON_PRIMARY}>
              {START_CTA}
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">{children}</main>
      <footer className="border-t border-slate-200 bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-slate-500">
          <span>
            ©{" "}
            <a
              href={STUDIO_URL}
              className={`${TAP_TARGET} ${PHONE_TAP} underline underline-offset-2 hover:text-slate-900`}
            >
              {SELLER_LEGAL_NAME}
            </a>{" "}
            · {CONTACT_EMAIL}
          </span>
          <nav className="flex flex-wrap items-center gap-x-4">
            {FOOTER_LINKS.map((link) => {
              return (
                <Link key={link.to} to={link.to} className={`${TAP_TARGET} ${PHONE_TAP} hover:text-slate-900`}>
                  {link.label}
                </Link>
              );
            })}
            <span className="sm:hidden">
              <ThemeToggle />
            </span>
          </nav>
        </div>
      </footer>
    </div>
  );
};
