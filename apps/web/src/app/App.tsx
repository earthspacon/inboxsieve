import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AlertsPage } from "../pages/AlertsPage";
import { BillingPage } from "../pages/BillingPage";
import { BrandsPage } from "../pages/BrandsPage";
import { DataPage } from "../pages/DataPage";
import { InboxPage } from "../pages/InboxPage";
import { LeadPage } from "../pages/LeadPage";
import { MorePage } from "../pages/MorePage";
import { OnboardingPage } from "../pages/OnboardingPage";
import { PipelinePage } from "../pages/PipelinePage";
import { ProfilePage } from "../pages/ProfilePage";
import { SignInPage } from "../pages/SignInPage";
import { SourcesPage } from "../pages/SourcesPage";
import { TeamPage } from "../pages/TeamPage";
import { AiPage } from "../site/AiPage";
import { ChiliPiperAlternativePage } from "../site/ChiliPiperAlternativePage";
import { LandingPage } from "../site/LandingPage";
import { LegalPage } from "../site/LegalPage";
import { PricingPage } from "../site/PricingPage";
import { SpamFilterPage } from "../site/SpamFilterPage";
import { AppShell, RequireSession } from "./AppShell";
import { ToastView } from "./ToastView";

export const App = () => {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
};

// Shared by the browser and by the build-time prerender (StaticRouter), so hydration sees the same tree.
export const AppRoutes = () => {
  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/terms" element={<LegalPage slug="terms" />} />
        <Route path="/privacy" element={<LegalPage slug="privacy" />} />
        <Route path="/refunds" element={<LegalPage slug="refunds" />} />
        <Route path="/dpa" element={<LegalPage slug="dpa" />} />
        <Route path="/ai" element={<AiPage />} />
        <Route path="/contact-form-spam-filter" element={<SpamFilterPage />} />
        <Route path="/chili-piper-alternative" element={<ChiliPiperAlternativePage />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/app" element={<RequireSession />}>
          <Route path="onboarding" element={<OnboardingPage />} />
          <Route element={<AppShell />}>
            <Route index element={<InboxPage />} />
            <Route path="leads/:leadId" element={<LeadPage />} />
            <Route path="pipeline" element={<PipelinePage />} />
            <Route path="sources" element={<SourcesPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="brands" element={<BrandsPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="data" element={<DataPage />} />
            <Route path="more" element={<MorePage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastView />
    </>
  );
};
