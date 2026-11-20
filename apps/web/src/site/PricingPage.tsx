import { PricingSection } from "./PricingSection";
import { SiteLayout } from "./SiteLayout";

export const PricingPage = () => {
  return (
    <SiteLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
        <p className="text-slate-600">
          We list every cost inside your price: payment processing, the AI at cost, hosting, and our fee. Sales tax or
          VAT is added by Paddle at checkout where due.
        </p>
        <PricingSection />
      </div>
    </SiteLayout>
  );
};
