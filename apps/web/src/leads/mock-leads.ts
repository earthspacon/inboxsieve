import { analyzeLead } from './analyzer';
import type { Lead, LeadInput, Source, Stage } from './config';
import { applyAnalysis, moveLead } from './lib';

type MockLead = LeadInput & {
  id: string;
  source: Source;
  hoursAgo: number;
  later: Stage[];
};

const HOUR_MS = 60 * 60 * 1000;

export const MOCK_LEADS: MockLead[] = [
  {
    id: 'seed-brightloop',
    source: 'form',
    hoursAgo: 3,
    later: [],
    name: 'Maya Okafor',
    email: 'maya@brightloop.example',
    company: 'Brightloop',
    subject: 'AI agent for support triage + CRM sync',
    message:
      "Hi! I'm the CEO and co-founder of Brightloop, a B2B SaaS for event teams (40 people). Our support inbox gets ~300 tickets a week and half are sales questions. We want an AI agent that triages tickets, answers the easy ones and pushes qualified ones into our CRM. Budget is $25k–$40k and we'd like it live by end of Q1. Can we talk this week?",
  },
  {
    id: 'seed-tidewell',
    source: 'email',
    hoursAgo: 30,
    later: ['replied', 'won'],
    name: 'Daniel Weiss',
    email: 'd.weiss@tidewell-freight.example',
    company: 'Tidewell Freight',
    subject: 'Automating quote requests from email',
    message:
      "I'm Head of Operations at Tidewell Freight. Our team copies quote requests from emails into spreadsheets by hand. We'd like a workflow that reads the email, extracts lanes and weights, and creates a deal in our CRM. We have about $8,000 set aside and need it within 6 weeks.",
  },
  {
    id: 'seed-copperline',
    source: 'email',
    hoursAgo: 52,
    later: [],
    name: 'Priya Raman',
    email: 'priya@copperline.example',
    company: 'Copperline Studio',
    subject: 'White-label partnership for AI integrations',
    message:
      "Hello, I'm the managing partner at Copperline Studio, a design agency in Manchester. Clients keep asking us for AI automation and we don't build that in-house. Would you be open to a white-label partnership where we pass you overflow work?",
  },
  {
    id: 'seed-fjordvale',
    source: 'form',
    hoursAgo: 80,
    later: ['replied'],
    name: 'Harald Lindqvist',
    email: 'h.lindqvist@fjordvale-insurance.example',
    company: 'Fjordvale Insurance',
    subject: 'RFP: AI document intake for claims',
    message:
      'Fjordvale Insurance is running a vendor selection for an AI document intake pilot (claims forms, PDFs, emails) with integration into our case system. The RFP pack is ready; the indicative budget is €120k and we plan to select a vendor by March. Please confirm your interest.',
  },
  {
    id: 'seed-kicker',
    source: 'form',
    hoursAgo: 140,
    later: [],
    name: 'Kevin Mott',
    email: 'kevin.m@mailbox.example',
    company: '',
    subject: 'How much is a chatbot?',
    message: 'Just curious how much a chatbot costs. No rush, maybe next year. Thanks.',
  },
  {
    id: 'seed-seo-spam',
    source: 'email',
    hoursAgo: 170,
    later: [],
    name: 'Rank Masters',
    email: 'offers@rank-masters.example',
    company: 'Rank Masters',
    subject: 'Get your site rank #1 on Google',
    message:
      'Dear Sir/Madam, we offer high quality backlinks and guest post placements. Your website can rank #1 within 30 days. Reply YES for our price list.',
  },
  {
    id: 'seed-bakery',
    source: 'form',
    hoursAgo: 230,
    later: [],
    name: 'Lucy Fenwick',
    email: 'lucy@crumbhouse-bakery.example',
    company: 'Crumbhouse Bakery',
    subject: 'Logo and WordPress site',
    message: 'Hi, I need a new logo and a small WordPress site for my bakery. Looking for the cheapest option, around $200.',
  },
  {
    id: 'seed-offshore',
    source: 'email',
    hoursAgo: 300,
    later: ['lost'],
    name: 'Ravi Sethu',
    email: 'ravi@codeforge-outsourcing.example',
    company: 'CodeForge Outsourcing',
    subject: 'Dedicated developers for your projects',
    message:
      'Hello team, our developers are available for long-term engagements at competitive rates. We can extend your team with React, Node and Python engineers. Let me know if you want our CVs.',
  },
  {
    id: 'seed-mapleborne',
    source: 'form',
    hoursAgo: 390,
    later: [],
    name: 'Sofia Marquez',
    email: 'sofia@mapleborne-realty.example',
    company: 'Mapleborne Realty',
    subject: 'Follow-up automation for property enquiries',
    message:
      "I'm the owner of a small real estate agency. We lose leads because nobody follows up on portal enquiries fast enough. Could you automate the follow-up and log everything in our CRM? Hoping to start next month.",
  },
  {
    id: 'seed-plugin',
    source: 'email',
    hoursAgo: 480,
    later: [],
    name: 'Tom Becker',
    email: 'tom@becker-bikes.example',
    company: 'Becker Bikes',
    subject: 'Contact form plugin not working',
    message: 'Our WordPress contact form plugin is broken since the last update. Can you fix our site? It is urgent.',
  },
  {
    id: 'seed-quillfern',
    source: 'form',
    hoursAgo: 600,
    later: ['replied'],
    name: 'Dr. Amara Bello',
    email: 'amara@quillfern-dental.example',
    company: 'Quillfern Dental',
    subject: 'AI receptionist for appointment booking',
    message:
      "I'm the founder of a 3-chair dental clinic. We miss calls and web enquiries after hours. We'd like an AI agent that answers questions and books appointments into our calendar. Budget around $5k, ideally ASAP.",
  },
  {
    id: 'seed-crypto',
    source: 'email',
    hoursAgo: 760,
    later: [],
    name: 'Victor Lane',
    email: 'vlane@moonyield.example',
    company: 'MoonYield',
    subject: 'Exclusive investment opportunity',
    message: 'Exclusive crypto investment opportunity with guaranteed 40% monthly returns. Click here to join before the pool closes.',
  },
];

export function buildMockLeads({ now }: { now: number }): Lead[] {
  return MOCK_LEADS.map(({ hoursAgo, later, ...mock }) => {
    const receivedAt = new Date(now - hoursAgo * HOUR_MS).toISOString();
    const lead: Lead = {
      ...mock,
      receivedAt,
      stage: 'new',
      history: [{ stage: 'new', at: receivedAt }],
      analysis: null,
      draft: '',
    };
    const analyzed = applyAnalysis({
      lead,
      analysis: analyzeLead(mock),
      at: receivedAt,
    });

    return later.reduce((current, stage) => {
      return moveLead({
        lead: current,
        stage,
        at: receivedAt,
      });
    }, analyzed);
  });
}
