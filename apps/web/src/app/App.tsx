import { useUnit } from 'effector-react';
import { Bot, CheckCircle2, Inbox, KanbanSquare, LayoutDashboard, Plus, Settings, XCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { HashRouter, NavLink, Route, Routes, useNavigate } from 'react-router-dom';

import { $isSimulateOpen, leadSimulated, simulateClosed, simulateOpened } from '../leads/model';
import { DashboardPage } from '../pages/DashboardPage';
import { InboxPage } from '../pages/InboxPage';
import { LeadPage } from '../pages/LeadPage';
import { PipelinePage } from '../pages/PipelinePage';
import { SettingsPage } from '../pages/SettingsPage';
import { $mode } from '../settings/model';
import { $toast } from '../shared/toast-model';

const NAV_ITEMS = [
  {
    to: '/',
    label: 'Inbox',
    icon: Inbox,
  },
  {
    to: '/pipeline',
    label: 'Pipeline',
    icon: KanbanSquare,
  },
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: Settings,
  },
];

const BUILT_IN_HOURS = 1;

const SAMPLE_LEAD = `Hi, I'm the COO of a 25-person accounting firm. We'd like an AI agent that reads client emails, sorts them by request type and drafts replies in our CRM. Budget is about $12k and we want it running within 4 weeks.`;

export const App = () => {
  return (
    <HashRouter>
      <div className="min-h-screen lg:pl-60">
        <Sidebar />
        <TopBar />
        <main className="mx-auto max-w-6xl px-4 pt-4 pb-24 lg:px-8 lg:pt-8 lg:pb-12">
          <Routes>
            <Route path="/" element={<InboxPage />} />
            <Route path="/leads/:id" element={<LeadPage />} />
            <Route path="/pipeline" element={<PipelinePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
        <BottomNav />
        <SimulateDialog />
        <ToastView />
      </div>
    </HashRouter>
  );
};

const Brand = () => {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white">
        <Bot className="size-5" />
      </span>
      <div className="leading-tight">
        <p className="text-sm font-semibold">Lead Agent</p>
        <p className="text-[11px] text-slate-500">by Spaceson Labs</p>
      </div>
    </div>
  );
};

const Sidebar = () => {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-slate-200 bg-white px-4 py-6 lg:flex">
      <Brand />
      <SimulateButton className="mt-6 w-full" />
      <nav className="mt-6 flex flex-col gap-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => {
                return `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'}`;
              }}
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          );
        })}
      </nav>
      <div className="mt-auto space-y-3">
        <ModeBadge />
        <p className="text-[11px] leading-snug text-slate-400">Demo · own product · built in {BUILT_IN_HOURS} h. All leads and companies are made up.</p>
      </div>
    </aside>
  );
};

const TopBar = () => {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
      <Brand />
      <SimulateButton />
    </header>
  );
};

const BottomNav = () => {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-slate-200 bg-white lg:hidden">
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
        return (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => {
              return `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-brand-600' : 'text-slate-500'}`;
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

const ModeBadge = () => {
  const { mode } = useUnit({ mode: $mode });
  return (
    <NavLink to="/settings" className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
      <span className={`size-2 rounded-full ${mode === 'live' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
      {mode === 'live' ? 'Live · Claude Haiku' : 'Demo analyzer (offline)'}
    </NavLink>
  );
};

const SimulateButton = ({ className = '' }: { className?: string }) => {
  return (
    <button
      type="button"
      onClick={() => simulateOpened()}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 ${className}`}
    >
      <Plus className="size-4" />
      Simulate new lead
    </button>
  );
};

const SimulateDialog = () => {
  const { isOpen } = useUnit({ isOpen: $isSimulateOpen });

  if (!isOpen) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" onClick={() => simulateClosed()}>
      <div className="w-full max-w-lg rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
        <SimulateForm />
      </div>
    </div>
  );
};

const SimulateForm = () => {
  const [name, setName] = useState('Jordan Ellis');
  const [email, setEmail] = useState('jordan@ledgerpine.example');
  const [company, setCompany] = useState('Ledgerpine Accounting');
  const [subject, setSubject] = useState('AI agent to sort client emails');
  const [message, setMessage] = useState(SAMPLE_LEAD);
  const navigate = useNavigate();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    leadSimulated({
      name,
      email,
      company,
      subject,
      message,
    });
    navigate('/');
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Simulate an inbound lead</h2>
        <p className="text-sm text-slate-500">Paste any contact-form text. The agent scores it and drafts a reply.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field required label="Name" value={name} onChange={setName} />
        <Field required label="Email" value={email} onChange={setEmail} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Company" value={company} onChange={setCompany} />
        <Field required label="Subject" value={subject} onChange={setSubject} />
      </div>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Message</span>
        <textarea
          required
          rows={6}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => simulateClosed()} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
        <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Send to agent
        </button>
      </div>
    </form>
  );
};

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
};

const Field = ({ label, value, onChange, required = false }: FieldProps) => {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <input
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
      />
    </label>
  );
};

const ToastView = () => {
  const { toast } = useUnit({ toast: $toast });

  if (!toast) {
    return null;
  }
  const Icon = toast.tone === 'success' ? CheckCircle2 : XCircle;
  return (
    <div role="status" className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-sm items-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg lg:bottom-6">
      <Icon className={`size-4 shrink-0 ${toast.tone === 'success' ? 'text-emerald-400' : 'text-rose-400'}`} />
      {toast.text}
    </div>
  );
};
