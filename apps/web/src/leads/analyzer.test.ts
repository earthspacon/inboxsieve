import { describe, expect, it } from 'vitest';

import { analyzeLead, extractBudget, extractTimeline } from './analyzer';
import { MOCK_LEADS } from './mock-leads';

function analyzeMock(id: string) {
  const mock = MOCK_LEADS.find((lead) => lead.id === id);
  if (!mock) {
    throw new Error(`no mock lead ${id}`);
  }
  return analyzeLead(mock);
}

describe('demo analyzer on the seed leads', () => {
  it('rates the SaaS founder with budget and deadline as hot', () => {
    const analysis = analyzeMock('seed-brightloop');

    expect(analysis.category).toBe('hot');
    expect(analysis.budget).toBe('$25k–$40k');
    expect(analysis.timeline).toBe('by end of Q1');
    expect(analysis.decisionMaker).toBe(true);
    expect(analysis.intent).toBe('new-project');
  });

  it('scores every hot lead above every cold one', () => {
    const scores = MOCK_LEADS.map((lead) => analyzeLead(lead));
    const hot = scores.filter((analysis) => analysis.category === 'hot').map((analysis) => analysis.score);
    const cold = scores.filter((analysis) => analysis.category === 'cold').map((analysis) => analysis.score);

    expect(hot.length).toBeGreaterThanOrEqual(3);
    expect(cold.length).toBeGreaterThanOrEqual(3);
    expect(Math.min(...hot)).toBeGreaterThan(Math.max(...cold));
  });

  it('flags SEO and crypto pitches as spam with no draft reply', () => {
    for (const id of ['seed-seo-spam', 'seed-crypto']) {
      const analysis = analyzeMock(id);
      expect(analysis.category).toBe('spam');
      expect(analysis.draftReply).toBe('');
    }
  });

  it('keeps the tire-kicker, the cheap logo job and the vendor pitch cold', () => {
    expect(analyzeMock('seed-kicker').category).toBe('cold');
    expect(analyzeMock('seed-bakery').category).toBe('cold');
    expect(analyzeMock('seed-offshore').intent).toBe('job');
    expect(analyzeMock('seed-offshore').category).toBe('cold');
  });

  it('recognises the agency partner and the enterprise RFP', () => {
    expect(analyzeMock('seed-copperline').intent).toBe('partnership');
    expect(analyzeMock('seed-copperline').category).toBe('warm');
    expect(analyzeMock('seed-fjordvale').intent).toBe('rfp');
    expect(analyzeMock('seed-fjordvale').budget).toBe('€120k');
  });

  it('addresses the draft reply to the lead by first name', () => {
    expect(analyzeMock('seed-tidewell').draftReply.startsWith('Hi Daniel,')).toBe(true);
  });
});

describe('budget and timeline extraction', () => {
  it('reads the upper end of a k-range as the budget size', () => {
    expect(extractBudget('we have $10-15k')).toEqual({ label: '$10-15k', usd: 15_000 });
  });

  it('reads plain amounts with thousands separators', () => {
    expect(extractBudget('about $8,000 set aside')?.usd).toBe(8000);
  });

  it('returns null when no amount or timeline is given', () => {
    expect(extractBudget('no idea about money')).toBeNull();
    expect(extractTimeline('whenever')).toBeNull();
  });
});
