import { handleRequest } from "./app";
import { createDeps } from "./deps";
import type { Env } from "./env";
import { handleInboundEmail } from "./ingest/email";
import { runDueJobs } from "./leads/jobs";

export default {
  fetch: async (request, env, ctx) => {
    return handleRequest({ deps: createDeps({ env, ctx }), request });
  },

  email: async (message, env, ctx) => {
    const deps = createDeps({ env, ctx });
    const outcome = await handleInboundEmail({ db: deps.db, message, now: deps.now() });

    if (outcome.kind === "lead") {
      deps.schedule(runDueJobs({ db: deps.db, analyzer: deps.analyzer, now: deps.now() }));
    }
  },

  scheduled: async (_controller, env, ctx) => {
    const deps = createDeps({ env, ctx });
    deps.schedule(runDueJobs({ db: deps.db, analyzer: deps.analyzer, now: deps.now() }));
  },
} satisfies ExportedHandler<Env>;
