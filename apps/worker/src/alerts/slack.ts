export type SlackPoster = {
  post: (message: { url: string; text: string }) => Promise<void>;
};

export const SLACK_WEBHOOK_PREFIX = "https://hooks.slack.com/";

export function createSlackPoster(): SlackPoster {
  return {
    post: async ({ url, text }) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error(`Slack returned ${response.status}`);
      }
    },
  };
}
