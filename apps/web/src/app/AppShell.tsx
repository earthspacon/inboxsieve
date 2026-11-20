import type { BrandDto } from "@inboxsieve/contract";
import { useUnit } from "effector-react";
import {
  Bell,
  Building2,
  CreditCard,
  Database,
  Filter,
  Inbox,
  KanbanSquare,
  LogOut,
  Menu,
  PlugZap,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Link, Navigate, NavLink, Outlet } from "react-router-dom";

import { usageRemote } from "../profile/model";
import {
  $brand,
  $me,
  $sessionError,
  $sessionStatus,
  brandSelected,
  meRefreshRequested,
  signOutClicked,
} from "../session/model";
import { Banner, ErrorState, LoadingState } from "../shared/ui";

type NavItem = { to: string; label: string; icon: LucideIcon };

const NAV_ITEMS: NavItem[] = [
  {
    to: "/app",
    label: "Inbox",
    icon: Inbox,
  },
  {
    to: "/app/pipeline",
    label: "Pipeline",
    icon: KanbanSquare,
  },
  {
    to: "/app/sources",
    label: "Sources",
    icon: PlugZap,
  },
  {
    to: "/app/profile",
    label: "Profile",
    icon: UserRound,
  },
  {
    to: "/app/brands",
    label: "Brands",
    icon: Building2,
  },
  {
    to: "/app/alerts",
    label: "Alerts",
    icon: Bell,
  },
  {
    to: "/app/team",
    label: "Team",
    icon: Users,
  },
  {
    to: "/app/billing",
    label: "Billing",
    icon: CreditCard,
  },
  {
    to: "/app/data",
    label: "Data",
    icon: Database,
  },
];

const MOBILE_NAV_ITEMS: NavItem[] = [
  ...NAV_ITEMS.slice(0, 3),
  {
    to: "/app/more",
    label: "More",
    icon: Menu,
  },
];

export const RequireSession = () => {
  const { status, error, me } = useUnit({
    status: $sessionStatus,
    error: $sessionError,
    me: $me,
  });

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-md p-8">
        <LoadingState />
      </div>
    );
  }
  if (status === "signed_out") {
    return <Navigate to="/sign-in" replace />;
  }
  if (status === "no_account") {
    return <NoAccess />;
  }
  if (status === "error" || !me) {
    return (
      <div className="mx-auto max-w-md p-8">
        <ErrorState message={error} onRetry={() => meRefreshRequested()} />
      </div>
    );
  }
  return <Outlet />;
};

export const AppShell = () => {
  return (
    <div className="min-h-screen lg:pl-60">
      <Sidebar />
      <TopBar />
      <main className="mx-auto max-w-6xl space-y-4 px-4 pt-4 pb-24 lg:px-8 lg:pt-8 lg:pb-12">
        <AccountBanners />
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
};

const NoAccess = () => {
  return (
    <div className="mx-auto max-w-md space-y-3 p-8 text-center">
      <h1 className="text-xl font-semibold">No access</h1>
      <p className="text-sm text-slate-600">This email has no active seat. Ask the workspace owner for a new invite.</p>
      <button type="button" onClick={() => signOutClicked()} className="text-sm font-medium text-brand-700">
        Sign out
      </button>
    </div>
  );
};

export const Logo = ({ to }: { to: string }) => {
  return (
    <Link to={to} className="flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white">
        <Filter className="size-4" />
      </span>
      <span className="text-sm font-semibold">InboxSieve</span>
    </Link>
  );
};

const Sidebar = () => {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-slate-200 bg-white px-4 py-6 lg:flex">
      <Logo to="/app" />
      <BrandSwitcher />
      <nav className="mt-6 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          return <SidebarLink key={item.to} item={item} />;
        })}
      </nav>
      <div className="mt-auto space-y-3">
        <UsageMeter />
        <AccountFooter />
      </div>
    </aside>
  );
};

const SidebarLink = ({ item }: { item: NavItem }) => {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === "/app"}
      className={({ isActive }) => {
        return `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"}`;
      }}
    >
      <Icon className="size-4" />
      {item.label}
    </NavLink>
  );
};

const BrandSwitcher = () => {
  const { me, brand } = useUnit({
    me: $me,
    brand: $brand,
  });

  if (!me || !brand) {
    return null;
  }
  if (me.brands.length === 1) {
    return <p className="mt-6 truncate rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium">{brand.name}</p>;
  }
  return (
    <label className="mt-6 block text-xs text-slate-500">
      Brand
      <select
        value={brand.id}
        onChange={(event) => brandSelected(event.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
      >
        {me.brands.map((item: BrandDto) => {
          return (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          );
        })}
      </select>
    </label>
  );
};

export const UsageMeter = () => {
  const { usage } = useUnit({ usage: usageRemote.$data });

  if (!usage) {
    return null;
  }
  const percent = Math.min(100, Math.round((usage.used / usage.limit) * 100));
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
      <div className="flex justify-between">
        <span>Leads this month</span>
        <span className="tabular-nums">
          {usage.used} / {usage.limit}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full ${percent >= 100 ? "bg-rose-500" : "bg-brand-500"}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
};

const AccountFooter = () => {
  const { me } = useUnit({ me: $me });
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
      <span className="truncate">{me?.user.email}</span>
      <button type="button" onClick={() => signOutClicked()} aria-label="Sign out" className="hover:text-slate-900">
        <LogOut className="size-4" />
      </button>
    </div>
  );
};

const TopBar = () => {
  const { brand } = useUnit({ brand: $brand });
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
      <Logo to="/app" />
      <span className="truncate text-sm text-slate-500">{brand?.name}</span>
    </header>
  );
};

const BottomNav = () => {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-slate-200 bg-white lg:hidden">
      {MOBILE_NAV_ITEMS.map(({ to, label, icon: Icon }) => {
        return (
          <NavLink
            key={to}
            to={to}
            end={to === "/app"}
            className={({ isActive }) => {
              return `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? "text-brand-600" : "text-slate-500"}`;
            }}
          >
            <Icon className="size-5" />
            {label}
          </NavLink>
        );
      })}
    </nav>
  );
};

const AccountBanners = () => {
  return (
    <>
      <SubscriptionBanner />
      <ReadOnlyBrandBanner />
      <UsageBanner />
    </>
  );
};

const SubscriptionBanner = () => {
  const { me } = useUnit({ me: $me });

  if (me?.account.subscription === "past_due") {
    return (
      <Banner tone="danger">
        Your last payment failed. Everything keeps working for 7 days, then analysis pauses.{" "}
        <Link to="/app/billing" className="font-semibold underline">
          Update your card
        </Link>
      </Banner>
    );
  }
  if (me?.account.access === "read_only") {
    return (
      <Banner tone="warning">
        Your subscription is {me.account.subscription}. The workspace is read-only; CSV export still works.{" "}
        <Link to="/app/billing" className="font-semibold underline">
          Billing
        </Link>
      </Banner>
    );
  }
  return null;
};

const ReadOnlyBrandBanner = () => {
  const { brand } = useUnit({ brand: $brand });

  if (!brand?.readOnly) {
    return null;
  }
  return (
    <Banner tone="warning">
      {brand.name} is read-only on your current plan.{" "}
      <Link to="/app/billing" className="font-semibold underline">
        Upgrade to edit it
      </Link>
    </Banner>
  );
};

const UsageBanner = () => {
  const { usage } = useUnit({ usage: usageRemote.$data });

  if (!usage || usage.used < usage.limit) {
    return null;
  }
  return (
    <Banner tone="warning">
      You've used all {usage.limit} analyzed leads this month. New leads are stored but not scored until the 1st.{" "}
      <Link to="/app/billing" className="font-semibold underline">
        Upgrade
      </Link>
    </Banner>
  );
};
