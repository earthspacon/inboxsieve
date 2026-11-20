import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";

import type { Env } from "./env";
import type { Mailer } from "./mailer";
import { acceptPendingInvites, createAccount, hasPendingInvite } from "./repo";

export const MAGIC_LINK_TTL_SECONDS = 15 * 60;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const TIMESTAMPS = {
  createdAt: "created_at",
  updatedAt: "updated_at",
};

// Better Auth's Google code exchange endpoint (tests fake it).
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

// "Continue with Google" exists only when the OAuth client is configured; otherwise email links alone.
export function isGoogleSignInEnabled(env: Pick<Env, "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET">) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

function buildSocialProviders(env: Env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return {};
  }
  return {
    // Default scopes only (openid email profile): no Google verification review needed.
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      prompt: "select_account" as const,
    },
  };
}

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
    socialProviders: buildSocialProviders(env),
    account: {
      // Google verifies the email, so a Google sign-in with the same address joins the existing user.
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
      },
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
            // An invited person joins the inviting workspace instead of starting their own.
            if (await hasPendingInvite({ db: env.DB, email: user.email })) {
              return;
            }
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
      session: {
        create: {
          after: async (session) => {
            await acceptPendingInvites({ db: env.DB, userId: session.userId });
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_SECONDS,
        storeToken: "hashed",
        sendMagicLink: async ({ email, url }) => {
          if (await hasPendingInvite({ db: env.DB, email })) {
            await mailer.send({
              to: email,
              subject: "You're invited to an InboxSieve workspace",
              text: `You've been invited to a team on InboxSieve.\nAccept and sign in:\n${url}\n\nThe link works once and expires in 15 minutes.`,
            });
            return;
          }
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
