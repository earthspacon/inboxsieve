import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Logo } from "../app/AppShell";
import { BUTTON_PRIMARY } from "../shared/ui";
import { CONTACT_EMAIL, FOOTER_LINKS, SELLER_LEGAL_NAME } from "./config";

export const SiteLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Logo to="/" />
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/pricing" className="text-slate-600 hover:text-slate-900">
              Pricing
            </Link>
            <Link to="/sign-in" className="text-slate-600 hover:text-slate-900 max-sm:hidden">
              Sign in
            </Link>
            <Link to="/sign-in" className={BUTTON_PRIMARY}>
              Start 7-day trial
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">{children}</main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-slate-500">
          <span>
            © {SELLER_LEGAL_NAME} · {CONTACT_EMAIL}
          </span>
          <nav className="flex flex-wrap gap-4">
            {FOOTER_LINKS.map((link) => {
              return (
                <Link key={link.to} to={link.to} className="hover:text-slate-900">
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </footer>
    </div>
  );
};
