import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";

import type { Env } from "./env";
import type { Mailer } from "./mailer";
import { createAccount } from "./repo";

export const MAGIC_LINK_TTL_SECONDS = 15 * 60;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const TIMESTAMPS = {
  createdAt: "created_at",
  updatedAt: "updated_at",
};

export function createAuth({ env, mailer }: { env: Env; mailer: Mailer }) {
  return betterAuth({
    database: env.DB,
    baseURL: env.APP_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    telemetry: { enabled: false },
    advanced: {
      ipAddress: { disableIpTracking: true },
    },
    user: {
      modelName: "users",
      fields: {
        emailVerified: "email_verified",
        ...TIMESTAMPS,
      },
    },
    session: {
      modelName: "sessions",
      expiresIn: SESSION_TTL_SECONDS,
      fields: {
        userId: "user_id",
        expiresAt: "expires_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        ...TIMESTAMPS,
      },
    },
    account: {
      modelName: "auth_identities",
      fields: {
        accountId: "provider_account_id",
        providerId: "provider_id",
        userId: "user_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        ...TIMESTAMPS,
      },
    },
    verification: {
      modelName: "magic_links",
      fields: {
        expiresAt: "expires_at",
        ...TIMESTAMPS,
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await createAccount({
              db: env.DB,
              userId: user.id,
              email: user.email,
              plan: "solo",
              status: "no_subscription",
              now: new Date(),
            });
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_SECONDS,
        storeToken: "hashed",
        sendMagicLink: async ({ email, url }) => {
          await mailer.send({
            to: email,
            subject: "Your InboxSieve sign-in link",
            text: `Sign in to InboxSieve:\n${url}\n\nThe link works once and expires in 15 minutes.`,
          });
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
