import { useUnit } from "effector-react";

import { Logo } from "../app/AppShell";
import { $me, signOutClicked } from "../session/model";
import { Card } from "../shared/ui";

export const CheckoutPage = () => {
  const { me } = useUnit({ me: $me });
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <Logo />
      <Card className="space-y-3 p-6">
        <h1 className="text-xl font-semibold">Finish checkout to start your 7-day trial</h1>
        <p className="text-sm text-slate-600">Signed in as {me?.user.email}. The app unlocks once checkout is done.</p>
        <button type="button" onClick={() => signOutClicked()} className="text-sm text-slate-500 underline">
          Sign out
        </button>
      </Card>
    </div>
  );
};
