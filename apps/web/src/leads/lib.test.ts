import { describe, expect, it } from "vitest";

import { buildComposeLinks, buildLeadsQuery, DEFAULT_FILTERS, getInboxEmptyState } from "./lib";

describe("buildLeadsQuery", () => {
  it("sends only the filters the user set, with the server's parameter names", () => {
    const query = buildLeadsQuery({
      stage: "contacted",
      category: "all",
      scoreMin: 75,
      search: "  acme ",
    });

    expect(Object.fromEntries(new URLSearchParams(query))).toEqual({
      limit: "100",
      stage: "contacted",
      scoreMin: "75",
      q: "acme",
    });
  });
});

describe("getInboxEmptyState", () => {
  it("asks to connect a source when there are no sources and no filters", () => {
    expect(getInboxEmptyState({ sourceCount: 0, leadCount: 0, filters: DEFAULT_FILTERS })).toBe("no_sources");
  });

  it('offers "Send a test lead" when sources exist but nothing arrived', () => {
    expect(getInboxEmptyState({ sourceCount: 1, leadCount: 0, filters: DEFAULT_FILTERS })).toBe("no_leads");
  });

  it("says the filters match nothing when a filter is active", () => {
    const filters = {
      ...DEFAULT_FILTERS,
      scoreMin: 90,
    };

    expect(getInboxEmptyState({ sourceCount: 0, leadCount: 0, filters })).toBe("no_matches");
  });
});

describe("buildComposeLinks", () => {
  it("prefills recipient, a Re: subject and the draft in mailto, Gmail and Outlook links", () => {
    const links = buildComposeLinks({ to: "dana@northwind.example", subject: "Website rebuild", body: "Hi Dana & co" });

    expect(links.mailto).toBe(
      "mailto:dana%40northwind.example?subject=Re%3A%20Website%20rebuild&body=Hi%20Dana%20%26%20co",
    );
    expect(new URL(links.gmail).searchParams.get("su")).toBe("Re: Website rebuild");
    expect(new URL(links.gmail).searchParams.get("body")).toBe("Hi Dana & co");
    expect(new URL(links.outlook).searchParams.get("to")).toBe("dana@northwind.example");
  });

  it("does not stack a second Re:", () => {
    const links = buildComposeLinks({ to: "a@b.example", subject: "RE: Quote", body: "" });

    expect(new URL(links.gmail).searchParams.get("su")).toBe("RE: Quote");
  });
});
