// v1 wordlist. NOT reviewed by a native Hiligaynon/Tagalog speaker or by
// compliance — a representative starting set covering build-spec §5's
// prohibited categories, written with word-boundary regexes to reduce false
// positives (e.g. "reviewer" alone must not trip — a legitimate listing in
// the mockup). Review before launch.

export const BANNED_WORDS_VERSION = 1

interface Term {
  pattern: RegExp
  rule: string
  explanation: string
}

const HARD: Term[] = [
  {
    pattern: /\b(answer\s*key|test\s*bank|sagot\s*sa\s*exam|katong\s*sabat|thesis\s+for\s+sale)\b/i,
    rule: 'Academic integrity',
    explanation:
      "Exam papers, answer keys, and completed academic work aren't allowed. This is the one rule that gets the app shut down.",
  },
  {
    pattern: /\b(prescription|de[\s-]?reseta|antibiotic|paracetamol|tambal)\b/i,
    rule: 'Medicines & medical devices',
    explanation:
      'Medicines, supplements, and medical devices need a license Baylo does not check for.',
  },
  {
    pattern: /\b(vape|e-?cigarette|sigarilyo|tobacco|alak|alcohol)\b/i,
    rule: 'Alcohol, tobacco & vapes',
    explanation: 'Alcohol, tobacco, and vapes are not allowed on the floor.',
  },
  {
    pattern: /\b(balisong|butterfly\s*knife|utility\s*knife|firearm|baril)\b/i,
    rule: 'Weapons',
    explanation: 'Weapons, including replicas and utility knives, are not allowed.',
  },
  {
    pattern: /\b(puppy|kitten|for\s*sale.*(dog|cat|bird))\b/i,
    rule: 'Live animals',
    explanation: 'Live animals cannot be traded here.',
  },
  {
    pattern: /\b(school\s*id|student\s*id|transcript\s*of\s*records|tor|birth\s*certificate)\b/i,
    rule: 'Identity documents',
    explanation:
      "School IDs, uniforms with someone else's name tag, and official documents aren't allowed — this is an identity-fraud risk.",
  },
  {
    pattern: /\b(sangla|pautang|5-?6|loan\s*shark|crypto|bitcoin)\b/i,
    rule: 'Cash lending & crypto',
    explanation:
      'Cash lending, sangla/pawn arrangements, and crypto are outside what Baylo is for.',
  },
]

const SOFT: Term[] = [
  {
    pattern: /\bticket\b/i,
    rule: 'Event ticket resale',
    explanation:
      'Reselling event tickets above face value is not allowed. Make sure your price matches what you paid.',
  },
]

export interface ScanMatch {
  rule: string
  explanation: string
}

export interface ScanResult {
  severity: 'clean' | 'soft' | 'hard'
  matches: ScanMatch[]
}

export function scanListingText(text: string): ScanResult {
  const hardMatches = HARD.filter((t) => t.pattern.test(text)).map(({ rule, explanation }) => ({
    rule,
    explanation,
  }))
  if (hardMatches.length > 0) return { severity: 'hard', matches: hardMatches }

  const softMatches = SOFT.filter((t) => t.pattern.test(text)).map(({ rule, explanation }) => ({
    rule,
    explanation,
  }))
  if (softMatches.length > 0) return { severity: 'soft', matches: softMatches }

  return { severity: 'clean', matches: [] }
}
