// Cross-checks every finding (API + consumer-app) against the corpus using
// Claude. Every verdict must carry visible reasoning — no bare pass/fail.

const { canonicalizeTheme, matchThemeKey, THEME_LABELS } = require('./themes');

const VERDICT_TAXONOMY = `
VERIFIED — the finding matches a real corpus row closely (verbatim or near-verbatim quote, matching theme, consistent date/rating).
THEME_VERIFIED — the general theme/category is genuinely supported by multiple corpus rows, but this specific quote, reviewer, date, or platform is not confirmable (e.g. attributed to a platform outside this corpus's scope).
UNVERIFIABLE — no corpus evidence either supports or contradicts this finding; genuinely unknown, not necessarily false. This includes claims attributed to platforms outside this corpus's scope (Yelp, Booking.com, Agoda, Expedia, etc.) — the underlying theme may be entirely real but cannot be checked against this corpus.
DISPROVEN_IN_SAMPLE — the corpus (a bounded, ~100-row sample of ONE platform) contains real complaints that disagree with the finding — most commonly a GREEN/clean verdict that multiple corpus rows contradict. This is deliberately WEAKER than FABRICATED: it means "our specific sample disagrees with this," not "this was invented." The corpus is a sample, not the full universe of reviews across every platform — disagreement within our ~100 rows does not prove the AI fabricated anything, only that its claim doesn't match what we found here.
FABRICATED — reserve this ONLY for (a) direct contradiction of a SPECIFIC FACT, where the corpus states a concrete detail (a figure, a date, a name) that conflicts with the finding's own concrete detail for what is evidently the same incident (e.g. corpus says a fee was £40, the finding claims £80 for the same event), or (b) structural implausibility independent of sample size (an invented platform name that is not a real, recognized review site; an internally impossible or self-contradicting detail). Do NOT use FABRICATED merely because a claim isn't found in the corpus, or because a GREEN verdict is contradicted by corpus complaints — those are UNVERIFIABLE or DISPROVEN_IN_SAMPLE respectively. Every FABRICATED verdict's evidence MUST explicitly state why this rises above mere absence-from-sample.
CONTRADICTED — use this ONLY when TWO OR MORE FINDINGS disagree with each other, not when a single finding disagrees with the corpus. Examples: two engines rate the same category differently (one GREEN, one AMBER); the same engine states two different dollar figures for what should be the same fee; a consumer-app answer states a fact that contradicts an API finding. Always name both conflicting findings explicitly in the evidence field.

DISAMBIGUATION RULE — walk through in this order for every finding:
1. Does this finding disagree with ANOTHER FINDING (not the corpus)? → CONTRADICTED.
2. Does the corpus directly contradict a SPECIFIC FACT this finding asserts, or is the finding structurally implausible regardless of sample coverage? → FABRICATED — state explicitly why this is more than absence-from-sample.
3. Is this a GREEN/clean verdict that corpus complaints disagree with, with no specific fact directly contradicted? → DISPROVEN_IN_SAMPLE.
4. Is there simply no corpus evidence either way, including attribution to a platform outside this corpus's scope? → UNVERIFIABLE.
`.trim();

// Best-effort theme recovery for the oldest saved runs, where API findings
// carried no theme field at all — only part_or_theme set to a bare "A"/"B"/"C".
// claim_summary conventionally opens with the theme as its subject (e.g.
// "Staff receive no significant complaints...", "Value receives an AMBER
// verdict..."), so try matching the leading 1-3 words against the theme
// taxonomy. If nothing matches (multi-theme or uncategorized summaries),
// leave it blank rather than guess wrong.
function inferThemeFromClaim(claimSummary) {
  const words = (claimSummary || '').trim().split(/\s+/).slice(0, 3);
  for (let n = words.length; n >= 1; n--) {
    const key = matchThemeKey(words.slice(0, n).join(' '));
    if (key) return THEME_LABELS[key];
  }
  return '';
}

// Recovers { part, theme } from whichever shape a finding actually has.
// Current runs (via runVerification below) already carry separate part and
// theme fields. Older saved runs only carry a combined part_or_theme field,
// in one of three shapes seen across schema versions:
//   1. "A - Some Theme"          (dash format)
//   2. "A" / "B" / "C"           (API rows — part only, no theme captured)
//   3. "room_quality" / "Staff"  (consumer rows — theme only, no part)
function extractPartTheme(f) {
  if (f.part !== undefined || f.theme !== undefined) {
    return { part: f.part, theme: f.theme };
  }
  const raw = (f.part_or_theme || '').toString().trim();
  const source = (f.source || '').toString().trim().toLowerCase();

  const dashMatch = raw.match(/^([ABC])\s*-\s*(.+)$/);
  if (dashMatch) return { part: dashMatch[1], theme: dashMatch[2] };

  if (source === 'api' && /^[ABC]$/i.test(raw)) {
    return { part: raw.toUpperCase(), theme: inferThemeFromClaim(f.claim_summary) };
  }
  if (source === 'consumer') {
    return { part: '', theme: raw };
  }
  return { part: '', theme: raw };
}

// Claude is asked in the prompt to already follow these rules, but LLM
// output compliance isn't guaranteed row-by-row, and older saved runs
// predate this normalization (some predate having separate part/theme
// fields at all — see extractPartTheme). Enforce both in code so the table
// is always consistent regardless of source or run age:
//   - part: "A"/"B"/"C" for API findings, null for consumer findings
//     (consumer-app answers aren't split into parts).
//   - theme: collapsed to the canonical consumer-app template label
//     (e.g. "Wi-Fi", "Room Quality") whether the raw value was already a
//     label, a snake_case key (consumer findings are keyed that way
//     internally), or some other Claude-invented variant.
function normalizeFinding(f) {
  const { part: rawPart, theme: rawTheme } = extractPartTheme(f);
  const source = (f.source || '').toString().trim().toLowerCase();
  const isApi = source === 'api';

  let part = (rawPart || '').toString().trim().toUpperCase();
  if (!isApi) {
    part = null;
  } else if (!['A', 'B', 'C'].includes(part)) {
    part = part || null; // keep an unexpected non-empty value rather than discarding data silently
  }

  const theme = canonicalizeTheme(rawTheme);

  return { ...f, source, part, theme };
}

function stripRawResponse(apiFindings) {
  const clean = {};
  for (const [engine, parts] of Object.entries(apiFindings || {})) {
    clean[engine] = {};
    for (const [part, result] of Object.entries(parts || {})) {
      if (!result) continue;
      // Deliberately omit raw_response — it's the full provider API payload
      // (echoed system prompt, duplicated search queries, Gemini's decorative
      // SVG/CSS search-chip HTML) and adds nothing to verification, only cost.
      clean[engine][part] = {
        engine: result.engine,
        part: result.part,
        grounded: result.grounded,
        citations: result.citations,
        raw_text: result.raw_text
      };
    }
  }
  return clean;
}

function buildVerificationPrompt(hotel) {
  const apiSection = JSON.stringify(stripRawResponse(hotel.api_findings), null, 2);
  const consumerSection = JSON.stringify(hotel.consumer_findings, null, 2);
  const corpusSection = hotel.corpus
    .map((r, i) => `[#${r.id || i + 1} | ${r.rating}★ ${r.date}] ${r.title} :: ${r.text}`.slice(0, 600))
    .join('\n---\n');

  return `You are the verification engine for cpulze, a service that checks whether AI-search findings about a hotel are actually true, based on real guest reviews.

Hotel: ${hotel.name} (${hotel.location})

VERDICT TAXONOMY — use exactly one of these six labels per finding:
${VERDICT_TAXONOMY}

TASK: Review every finding below (from the 9-branch API pipeline, and from manually-collected consumer-app answers) and check each one against the corpus of real reviews provided. Corpus rows are numbered (e.g. [#47 | 2★ May-26]) — cite these numbers in corpus_refs rather than repeating quotes at length. For every finding, output a JSON object with:
- source: "api" or "consumer"
- engine: which engine produced it
- part: for API findings, which Part this came from — "A", "B", or "C". For consumer findings, leave this an empty string "" (consumer answers aren't divided into parts).
- theme: the category/theme name (e.g. "Staff", "Room Quality", "Noise") — always populate this, for both api and consumer sources.
- claim_summary: one sentence describing the specific claim being checked
- verdict: one of VERIFIED / THEME_VERIFIED / UNVERIFIABLE / DISPROVEN_IN_SAMPLE / FABRICATED / CONTRADICTED
- evidence: 1-2 sentences of visible reasoning (be concise — reference corpus row numbers rather than quoting at length, or explain why nothing matched). If CONTRADICTED, name the conflicting finding explicitly. If FABRICATED, explicitly state why this is more than absence-from-sample.
- corpus_refs: array of corpus row numbers (integers) that support this finding's evidence — e.g. [12, 47]. Empty array if no corpus row applies (e.g. a pure cross-finding CONTRADICTED case, or UNVERIFIABLE with nothing in the corpus).
- confidence: low / medium / high

Also flag, in a separate "cross_findings_notes" array, any case where two findings (API vs consumer, or two API branches, or two consumer-app answers) make incompatible claims about the same fact — even if each individually seems plausible.

Finally, write a "summary" array of EXACTLY 5 short bullet strings (one sentence each) giving a hotel-owner-relevant overview of what this verification run found overall — e.g. the single strongest verified finding, the most concerning fabricated/disproven claim, the most notable cross-engine instability, and any pattern worth the owner's attention. Write these for a hotel owner audience, not a technical audience.

Output ONLY a JSON object with three top-level keys: "findings" (array of the per-finding objects above), "cross_findings_notes" (array of strings), and "summary" (array of exactly 5 strings). No prose outside the JSON.

=== API FINDINGS (9 branches, raw text + grounding status) ===
${apiSection}

=== CONSUMER APP FINDINGS (manually collected, by engine and theme) ===
${consumerSection}

=== CORPUS (real guest reviews, 1-3★, ground truth) ===
${corpusSection}`;
}

async function runVerification(hotel) {
  const prompt = buildVerificationPrompt(hotel);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 32000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error(`Verification call failed: ${res.status} ${await res.text()}`);
  const data = await res.json();

  if (data.stop_reason === 'max_tokens') {
    return {
      parse_error: 'Response was truncated by the token limit before completing — the dataset is likely too large for a single call. Consider raising max_tokens further or splitting verification into smaller batches (e.g. per-engine).',
      raw_text: (data.content || []).map(b => b.text || '').join('\n')
    };
  }

  const text = (data.content || []).map(b => b.text || '').join('\n');
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed.findings)) {
      parsed.findings = parsed.findings.map((f, i) => ({ id: i + 1, ...normalizeFinding(f) }));
    }
    return parsed;
  } catch (e) {
    return { parse_error: e.message, raw_text: text };
  }
}

module.exports = { runVerification, buildVerificationPrompt, VERDICT_TAXONOMY, normalizeFinding };