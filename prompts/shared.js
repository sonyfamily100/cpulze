const CATEGORIES_A = ['Staff', 'Room Quality', 'Cleanliness', 'Dining', 'Check-in/out', 'Value'];
const CATEGORIES_B = ['Noise', 'Maintenance', 'Wi-Fi & Connectivity', 'Accessibility', 'Family Suitability', 'Booking & Pricing Transparency'];

// Attribution fields (REVIEWER_n, REVIEW_DATE_n, PLATFORM_n) are OPTIONAL —
// this is the deliberate fix flagged in the July 15 session to test whether
// removing forced attribution reduces fake-reviewer fabrication. Compare
// results against the older, stricter version if you want to A/B this.
function categoryBlockTemplate(n, categoryName) {
  return (
    `CATEGORY_${n}: ${categoryName}\n` +
    `VERDICT_${n}: [RED / AMBER / GREEN]\n` +
    `// If GREEN, fill only the line below:\n` +
    `GREEN_NOTE_${n}: [one sentence — genuine confirmation nothing significant surfaced. Leave blank if RED/AMBER.]\n` +
    `// If RED or AMBER, fill the fields below and leave GREEN_NOTE blank:\n` +
    `SPECIFIC_LABEL_${n}: [a specific, hotel-specific label — e.g. "Hot Tub Temperature Control" not "Maintenance". Leave blank if GREEN.]\n` +
    `AI_SAYS_${n}: [what AI tells a sceptical traveller — 2 sentences, written directly to them. Leave blank if GREEN.]\n` +
    `BEST_QUOTE_${n}: [most vivid verbatim phrase — exact words, no paraphrasing. Leave blank if GREEN.]\n` +
    `REVIEWER_${n}: [OPTIONAL — only if a specific reviewer name/handle is confidently and independently known. Leave this line out entirely rather than guessing or inventing one.]\n` +
    `REVIEW_DATE_${n}: [OPTIONAL — only if confidently known. Leave this line out entirely rather than guessing.]\n` +
    `PLATFORM_${n}: [platform name only if confidently known — TripAdvisor, Booking.com, Google Reviews, etc. NO url, NO review ID. Leave blank if unsure — never invent a platform name.]\n` +
    `FREQUENCY_${n}: [genuine best estimate — "recurring across many reviews" / "a handful of mentions" / "single isolated mention". Leave blank if GREEN.]\n` +
    `WHY_PERSISTS_${n}: [one sentence. Leave blank if GREEN.]\n` +
    `INTERVENTION_${n}: [one specific action. Leave blank if GREEN.]`
  );
}

const SHARED_INSTRUCTIONS =
  'You are simulating what a traveller discovers when they research a hotel using AI search, specifically ' +
  'researching problems and complaints (a sceptical search). ' +
  'Draw from ALL sources you find: TripAdvisor, Google, Booking.com, Trustpilot, Expedia, travel forums, and any ' +
  'other indexed content. Never restrict to one platform. Use exact guest language when quoting. No paraphrasing. ' +
  'It is fine for the same underlying complaint to be reported under more than one category if it genuinely fits ' +
  'both — do not force artificial distinctness. ' +

  'VERBATIM QUOTE STANDARD: A valid BEST_QUOTE is ONE continuous, unedited excerpt taken from a SINGLE real ' +
  'review — first person, informal, specific, and coherent as one uninterrupted thought. The following are ALL ' +
  'critical failures, not just outright invention: ' +
  '(1) analytical summary prose dressed as a quote; ' +
  '(2) splicing — combining words or phrases from two different reviews, or two non-adjacent parts of the same ' +
  'review, into one quote; ' +
  '(3) numeric-detail laundering — taking one real, specific-sounding detail (a number, a name, a date) from a ' +
  'genuine source and building an invented scenario or cause around it. If you cannot produce a quote meeting ' +
  'this standard, leave BEST_QUOTE blank and downgrade the verdict instead of approximating one. ' +

  'ATTRIBUTION FIELDS ARE OPTIONAL, NOT MANDATORY: only include REVIEWER, REVIEW_DATE, or PLATFORM when you are ' +
  'independently confident of them. It is strongly preferable to omit these fields entirely than to invent a ' +
  'plausible-sounding name, date, or platform to complete the format. Never invent a platform name that is not ' +
  'a real, well-known review site. ' +

  'DATE HONESTY: If you are not confident of the actual review date, omit REVIEW_DATE rather than supplying one. ' +

  'Never assign RED or AMBER without a real verbatim quote you can point to. If you cannot find genuine, specific ' +
  'evidence for a category, the verdict is GREEN. It is entirely normal for most categories to come back GREEN. ' +

  'CRITICAL FORMAT RULE: Output plain text only. No markdown, asterisks, bold, headers, or bullet points. Every ' +
  'field MUST begin with its exact label as specified. Always end with STATUS: COMPLETE.';

module.exports = { CATEGORIES_A, CATEGORIES_B, categoryBlockTemplate, SHARED_INSTRUCTIONS };
