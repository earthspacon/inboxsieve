import { useUnit } from "effector-react";
import { Link } from "react-router-dom";

import { $sessionStatus } from "../session/model";

const DASHBOARD_LABEL = "Open dashboard";

// Prerendered HTML and a visitor see the signed-out label. Both labels share one grid
// cell, so the swap to "Open dashboard" after get-session answers moves nothing.
export const SessionLink = ({
  signedOutLabel,
  className,
  align = "center",
}: {
  signedOutLabel: string;
  className: string;
  align?: "center" | "end";
}) => {
  const { status } = useUnit({ status: $sessionStatus });
  // "error" still means get-session found a user; the dashboard shows the retry.
  const isSignedIn = status !== "loading" && status !== "signed_out";
  const label = isSignedIn ? DASHBOARD_LABEL : signedOutLabel;
  const reserved = isSignedIn ? signedOutLabel : DASHBOARD_LABEL;

  return (
    <Link to={isSignedIn ? "/app" : "/sign-in"} className={className}>
      <span className={`grid ${align === "end" ? "justify-items-end" : "justify-items-center"}`}>
        <span className="col-start-1 row-start-1">{label}</span>
        <span className="invisible col-start-1 row-start-1" aria-hidden="true">
          {reserved}
        </span>
      </span>
    </Link>
  );
};
