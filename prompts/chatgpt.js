// ChatGPT — Full Coverage (Part A / B / C), self-contained.
// Uses OpenAI's Responses API. Attribution fields are OPTIONAL per the
// July 15 fix: the model should never invent a reviewer, date, or platform
// to complete the format — a finding with zero attribution is fully valid.

const CATEGORIES_A = ['Staff', 'Room Quality', 'Cleanliness', 'Dining', 'Check-in/out', 'Value'];
const CATEGORIES_B = ['Noise', 'Maintenance', 'Wi-Fi & Connectivity', 'Accessibility', 'Family Suitability', 'Booking & Pricing Transparency'];

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
    `REVIEWER_${n}: [OPTIONAL. Omit this line entirely unless independently confident of a specific reviewer name/handle. Never guess.]\n` +
    `REVIEW_DATE_${n}: [OPTIONAL. Omit this line entirely unless independently confident of the approximate month/year. Never guess.]\n` +
    `PLATFORM_${n}: [Only include if confidently known — TripAdvisor, Booking.com, Google Reviews, etc. NO url, NO review ID. Never invent a platform name that isn't real and well-known. Omit if unsure.]\n` +
    `FREQUENCY_${n}: [genuine best estimate — "recurring across many reviews" / "a handful of mentions" / "single isolated mention". Leave blank if GREEN.]\n` +
    `WHY_PERSISTS_${n}: [one sentence. Leave blank if GREEN.]\n` +
    `INTERVENTION_${n}: [one specific action. Leave blank if GREEN.]`
  );
}

const SCORECARD_INSTRUCTIONS =
  'You are simulating what a traveller discovers when they research a hotel using AI search, specifically ' +
  'researching problems and complaints (a sceptical search). ' +
  'Draw from ALL sources you find: TripAdvisor, Google, Booking.com, Trustpilot, Expedia, travel forums, and any ' +
  'other indexed content. Never restrict to one platform. Use exact guest language when quoting. No paraphrasing. ' +
  'It is fine for the same underlying complaint to be reported under more than one category if it genuinely fits ' +
  'both — do not force artificial distinctness. ' +

  'VERBATIM QUOTE STANDARD: A valid BEST_QUOTE is ONE continuous, unedited excerpt taken from a SINGLE real ' +
  'review — first person, informal, specific, and coherent as one uninterrupted thought. The following are ALL ' +
  'critical failures, not just outright invention: (1) analytical summary prose dressed as a quote; ' +
  '(2) splicing — combining words or phrases from two different reviews, or two non-adjacent parts of the same ' +
  'review, into one quote; (3) numeric-detail laundering — taking one real, specific-sounding detail (a number, ' +
  'a name, a date) from a genuine source and building an invented scenario or cause around it. If you cannot ' +
  'produce a quote meeting this standard, leave BEST_QUOTE blank and downgrade the verdict instead. ' +

  'ATTRIBUTION FIELDS ARE OPTIONAL, NOT MANDATORY: only include REVIEWER, REVIEW_DATE, or PLATFORM when ' +
  'independently confident of them. It is strongly preferable to omit these fields entirely than to invent a ' +
  'plausible-sounding name, date, or platform to complete the format. A finding with a real, well-supported ' +
  'theme and zero attribution fields is a fully valid, complete finding — missing attribution does not make an ' +
  'answer incomplete. Never invent a platform name that is not a real, well-known review site. ' +

  'DATE HONESTY: if not confident of the actual review date, omit REVIEW_DATE rather than guessing. ' +

  'Never assign RED or AMBER without a real verbatim quote you can point to. If you cannot find genuine, specific ' +
  'evidence for a category, the verdict is GREEN — full stop. It is entirely normal for most categories to come ' +
  'back GREEN. UNCATEGORIZED_MENTIONS must never repeat a quote already used in a category block above. ' +

  'CRITICAL FORMAT RULE: Output plain text only. No markdown, asterisks, bold, headers, or bullet points. No ' +
  'summary paragraphs or introductions — begin directly with the first category. Every field you DO include ' +
  'must begin with its exact label — omitted optional lines are expected. Always end with STATUS: COMPLETE. ' +

  'MANDATORY GROUNDING RULE: you must actually use the web_search tool. Do not rely on training data. Every ' +
  'specific claim must come directly from a search result retrieved just now. If a field is not confidently ' +
  'known, OMIT IT rather than inventing content. Fabricating a quote, reviewer, date, or platform is a critical ' +
  'failure even if the underlying theme is real. If you cannot call web_search, output only ' +
  'GROUNDING_FAILED: true and stop.';

const NARRATIVE_INSTRUCTIONS =
  'You are simulating what a traveller discovers when they research a hotel using AI search before booking. ' +
  'Run three searches representing three different traveller mindsets — curious, comparing, and sceptical. ' +
  'Report what AI actually returns for each mindset — do not average or soften the sceptical results. ' +
  'Draw from ALL sources you find: TripAdvisor, Google, Booking.com, Trustpilot, Expedia, travel forums, and any ' +
  'other indexed content. Never restrict to one platform. ' +
  'CRITICAL FORMAT RULE: Output plain text only. No markdown, asterisks, bold, headers, or bullet points. Every ' +
  'field MUST begin with its exact label. Always end with STATUS: COMPLETE. ' +
  'MANDATORY GROUNDING RULE: use the web_search tool for each of the three queries. Do not rely on training ' +
  'data. If you cannot call web_search, output only GROUNDING_FAILED: true and stop.';

function buildPartA(hotelName, location) {
  const blocks = CATEGORIES_A.map((c, i) => categoryBlockTemplate(i + 1, c)).join('\n\n');
  const userText =
    `Research ${hotelName} in ${location} from the perspective of a sceptical traveller looking for problems, ` +
    `using search query "${hotelName} ${location} complaints problems" and any follow-up searches needed.\n\n---\n\n` +
    `CATEGORY SCORECARD — PART 1 OF 2\nEvaluate these ${CATEGORIES_A.length} categories, in this exact order: ${CATEGORIES_A.join(', ')}.\n\n` +
    blocks + `\n\n---\n\nUNCATEGORIZED_MENTIONS: [genuine complaints from THIS batch that don't fit above — one line each. Leave blank if none.]\n\nSTATUS: COMPLETE`;

  return {
    model: 'gpt-4.1-mini', instructions: SCORECARD_INSTRUCTIONS, input: userText,
    tools: [{ type: 'web_search', search_context_size: 'high' }], tool_choice: 'required', max_output_tokens: 6000
  };
}

function buildPartB(hotelName, location) {
  const blocks = CATEGORIES_B.map((c, i) => categoryBlockTemplate(7 + i, c)).join('\n\n');
  const userText =
    `Research ${hotelName} in ${location} from the perspective of a sceptical traveller looking for problems, ` +
    `using search query "${hotelName} ${location} complaints problems" and any follow-up searches needed.\n\n---\n\n` +
    `CATEGORY SCORECARD — PART 2 OF 2\nEvaluate these ${CATEGORIES_B.length} categories, in this exact order: ${CATEGORIES_B.join(', ')}.\n\n` +
    blocks + `\n\n---\n\nUNCATEGORIZED_MENTIONS: [genuine complaints from THIS batch that don't fit above — one line each. Leave blank if none.]\n\nSTATUS: COMPLETE`;

  return {
    model: 'gpt-4.1-mini', instructions: SCORECARD_INSTRUCTIONS, input: userText,
    tools: [{ type: 'web_search', search_context_size: 'high' }], tool_choice: 'required', max_output_tokens: 6000
  };
}

function buildPartC(hotelName, location) {
  const userText =
    `Simulate three travellers researching ${hotelName} in ${location}.\n\n` +
    `TRAVELLER 1 — CURIOUS AND OPEN\nQUERY_1: "${hotelName} ${location} reviews"\n` +
    `AI_NARRATIVE_1: [2 sentences]\nTONE_1: [positive/mixed/negative]\nSOURCES_1: [platforms cited]\n\n---\n\n` +
    `TRAVELLER 2 — COMPARING OPTIONS\nQUERY_2: "is ${hotelName} worth it"\n` +
    `AI_NARRATIVE_2: [2 sentences]\nTONE_2: [positive/mixed/negative]\nSOURCES_2: [platforms cited]\n\n---\n\n` +
    `TRAVELLER 3 — SCEPTICAL AND RESEARCHING PROBLEMS\nQUERY_3: "${hotelName} ${location} complaints problems"\n` +
    `Do NOT soften — report specific and negative content fully.\n` +
    `AI_NARRATIVE_3: [2-3 sentences]\nTONE_3: [positive/mixed/negative/critical]\nSOURCES_3: [platforms cited]\n\n---\n\n` +
    `DOMINANT_NARRATIVE: [one sentence]\nNARRATIVE_GAP: [one sentence]\n` +
    `NARRATIVE_RISK_LEVEL: [Low/Medium/High/Critical]\nRISK_REASON: [one sentence]\n\nSTATUS: COMPLETE`;

  return {
    model: 'gpt-4.1-mini', instructions: NARRATIVE_INSTRUCTIONS, input: userText,
    tools: [{ type: 'web_search', search_context_size: 'high' }], tool_choice: 'required', max_output_tokens: 3000
  };
}

// Call: POST https://api.openai.com/v1/responses, Authorization: Bearer OPENAI_API_KEY
module.exports = { buildPartA, buildPartB, buildPartC };