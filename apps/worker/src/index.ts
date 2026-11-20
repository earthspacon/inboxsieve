import { handleRequest } from "./app";
import { createDeps } from "./deps";
import type { Env } from "./env";
import { handleInboundEmail } from "./ingest/email";
import { runQueues } from "./leads/jobs";
import { MAINTENANCE_CRON, runMaintenance } from "./maintenance";

export default {
  fetch: async (request, env, ctx) => {
    return handleRequest({ deps: createDeps({ env, ctx }), request });
  },

  email: async (message, env, ctx) => {
    const deps = createDeps({ env, ctx });
    const outcome = await handleInboundEmail({ db: deps.db, message, now: deps.now() });

    if (outcome.kind === "lead") {
      deps.schedule(runQueues(deps));
    }
  },

  scheduled: async (controller, env, ctx) => {
    const deps = createDeps({ env, ctx });

    if (controller.cron === MAINTENANCE_CRON) {
      deps.schedule(runMaintenance({ deps, now: deps.now() }));
      return;
    }
    deps.schedule(runQueues(deps));
  },
} satisfies ExportedHandler<Env>;
