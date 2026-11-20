import { ChevronRight, LogOut } from "lucide-react";
import { Link } from "react-router-dom";

import { UsageMeter } from "../app/AppShell";
import { MORE_LINKS } from "../app/config";
import { signOutClicked } from "../session/model";
import { Card, PageHeader } from "../shared/ui";

export const MorePage = () => {
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" />
      <UsageMeter />
      <Card className="divide-y divide-slate-100">
        {MORE_LINKS.map((link) => {
          return (
            <Link key={link.to} to={link.to} className="flex items-center justify-between px-4 py-3 text-sm">
              {link.label}
              <ChevronRight className="size-4 text-slate-400" />
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => signOutClicked()}
          className="flex w-full items-center justify-between px-4 py-3 text-sm text-rose-700"
        >
          Sign out
          <LogOut className="size-4" />
        </button>
      </Card>
    </div>
  );
};
