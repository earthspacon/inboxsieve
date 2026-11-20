import { and, arr, bool, num, obj, or, str, val, type Contract } from '@withease/contracts';

const MAX_SCORE = 100;

const nullableStr = or(str, val(null));

const scoreInRange: Contract<number, number> = {
  isData: (value): value is number => value >= 0 && value <= MAX_SCORE,
  getErrorMessages: (value) => {
    return [`expected a score from 0 to ${MAX_SCORE}, got ${value}`];
  },
};

export const AnalysisContract = obj({
  score: and(num, scoreInRange),
  category: or(val('hot'), val('warm'), val('cold'), val('spam')),
  intent: or(
    val('new-project'),
    val('partnership'),
    val('rfp'),
    val('support'),
    val('job'),
    val('spam'),
    val('other'),
  ),
  budget: nullableStr,
  timeline: nullableStr,
  decisionMaker: bool,
  summary: str,
  reasons: arr(str),
  draftReply: str,
});

const StageContract = or(val('new'), val('qualified'), val('replied'), val('won'), val('lost'));

export const LeadContract = obj({
  id: str,
  source: or(val('form'), val('email')),
  name: str,
  email: str,
  company: str,
  subject: str,
  message: str,
  receivedAt: str,
  stage: StageContract,
  history: arr(obj({ stage: StageContract, at: str })),
  analysis: or(AnalysisContract, val(null)),
  draft: str,
});
