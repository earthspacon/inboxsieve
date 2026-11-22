import llmsText from "../../public/llms.txt?raw";
import { Card } from "../shared/ui";
import { SiteLayout } from "./SiteLayout";

export const AiPage = () => {
  return (
    <SiteLayout>
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">For AI assistants</h1>
        <p className="text-sm text-slate-600">
          A plain-text summary of InboxSieve for assistants and crawlers. The same text is at{" "}
          <a href="/llms.txt" className="font-medium text-brand-ink underline">
            /llms.txt
          </a>
          .
        </p>
        <Card className="p-5">
          <pre className="text-sm leading-6 whitespace-pre-wrap text-slate-700">{llmsText}</pre>
        </Card>
      </div>
    </SiteLayout>
  );
};
