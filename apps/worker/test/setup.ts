import { applyD1Migrations, env } from "cloudflare:test";

import { installFakeSiteverify } from "./turnstile";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
installFakeSiteverify();
