// Generates the client-safe report draft from a set of ALREADY-VERIFIED-RUN
// findings the user selected by hand — same selection mechanism as
// emailGen.js, but assembled into a full multi-theme report instead of a
// single cold email. Static pieces (the question asked per theme, pricing,
// the closing CTA) come from reportTemplate.js so they stay identical
// across every hotel; only the per-theme narrative (what AI said, how
// confident we are, what to do about it) is generated per run.
//
// The result is a DRAFT — the caller (server.js) stores it with
// status: 'draft' and it stays editable until explicitly approved, so
// nothing reaches a client without a human sign-off first.

const { canonicalizeTheme, matchThemeKey } = require('./themes');
const { themeQuestion, PRICING_TIERS, nextStepsBoilerplate } = require('./reportTemplate');

const HOUSE_RULES = `
HOUSE RULES — apply to every section, every hotel, without exception:
- NEVER mention "corpus," "verification," "AI Mirror," verdict labels (VERIFIED/THEME_VERIFIED/UNVERIFIABLE/DISPROVEN_IN_SAMPLE/FABRICATED/CONTRADICTED), or any internal methodology term. The client should never learn how findings were checked, only what was found and how confident we are.
- Findings must read as something a real prospective guest could reproduce themselves by asking an AI assistant a plain, neutral question.
- responses_by_engine entries describe what that AI assistant told a prospective guest, in neutral third person (e.g. "ChatGPT told prospective guests that..."), not what "our system found."
- source_context translates confidence into plain language without naming the taxonomy: e.g. a well-supported finding becomes "This matches what guests say in their own reviews."; an unsupported-but-plausible one becomes "We couldn't independently confirm this, but it's a plausible claim."; a contradicted-by-reviews one becomes "Guest reviews tell a different story here."; a cross-finding conflict becomes "Different AI assistants disagree with each other on this point."
- Never assert something is definitively true if the underlying finding was not well-supported — frame it as "AI is telling prospective guests X," not "X is true," unless the finding was strongly corroborated.
- recommendation is a concrete operational fix the hotel could make. owner_actions is something the OWNER personally can do this week (respond to a review, update a listing field, brief a shift) — keep both to 1-2 sentences.
- Keep every text field concise — this is a report the owner will actually read, not a wall of text.
`.trim();

function groupFindingsByTheme(selectedFindings) {
  const byKey = {};
  selectedFindings.forEach(f => {
    const key = matchThemeKey(f.theme) || canonicalizeTheme(f.theme) || 'uncategorized';
    if (!byKey[key]) byKey[key] = { themeKey: matchThemeKey(f.theme), themeLabel: canonicalizeTheme(f.theme) || 'Uncategorized', findings: [] };
    byKey[key].findings.push(f);
  });
  return Object.values(byKey);
}

function buildReportPrompt(hotel, selectedFindings) {
  const grouped = groupFindingsByTheme(selectedFindings);
  const themesSection = JSON.stringify(
    grouped.map(g => ({
      theme: g.themeLabel,
      findings: g.findings.map(f => ({
        engine: f.engine,
        source: f.source,
        claim_summary: f.claim_summary,
        verdict: f.verdict,
        evidence: f.evidence
      }))
    })),
    null, 2
  );

  return `You are drafting the content for a client-facing report for cpulze, a service that helps hotel owners understand what AI search tools are telling prospective guests about their property, verified against real guest reviews.

Hotel: ${hotel.name} (${hotel.location})

${HOUSE_RULES}

SELECTED FINDINGS, GROUPED BY THEME (the user has hand-picked these as the ones worth reporting on):
${themesSection}

TASK: For EACH theme listed above, produce one section. Within a theme, combine findings from different engines into a single "responses_by_engine" map keyed by engine name (chatgpt/gemini/perplexity) — only include engines that actually have a finding for that theme, one short sentence each. Then write ONE source_context sentence, ONE recommendation, and ONE owner_actions line for the theme as a whole (combining all of its findings' confidence, not one per finding).

Also write:
- "executive_summary": 4-6 sentences overview of what this report covers overall, for the hotel owner, in plain language, leading with the single most important theme.
- "closing_note": 1-2 sentences transitioning into next steps (no pricing, no call-to-action — those are added separately).

Output ONLY a JSON object with these keys:
- "executive_summary": string
- "theme_sections": array of { "theme": string (must exactly match one of the theme names given above), "responses_by_engine": object, "source_context": string, "recommendation": string, "owner_actions": string }
- "closing_note": string

No prose outside the JSON.`;
}

async function runReportGeneration(hotel, selectedFindings) {
  if (selectedFindings.length < 1) {
    throw new Error('At least one finding must be selected.');
  }
  const prompt = buildReportPrompt(hotel, selectedFindings);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error(`Report generation call failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || []).map(b => b.text || '').join('\n');
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return { parse_error: e.message, raw_text: text };
  }

  // Merge Claude's per-theme narrative with the static, code-owned pieces
  // (the exact question asked, pricing, closing CTA) so those stay
  // identical across every hotel and every run rather than being
  // re-invented — and re-worded — by the model each time.
  const themeSections = (Array.isArray(parsed.theme_sections) ? parsed.theme_sections : []).map(s => {
    const themeKey = matchThemeKey(s.theme);
    const themeLabel = canonicalizeTheme(s.theme);
    return {
      theme: themeLabel,
      question_asked: themeQuestion(themeKey, hotel.name),
      responses_by_engine: s.responses_by_engine || {},
      source_context: s.source_context || '',
      recommendation: s.recommendation || '',
      owner_actions: s.owner_actions || ''
    };
  });

  return {
    hotel_name: hotel.name,
    hotel_location: hotel.location,
    executive_summary: parsed.executive_summary || '',
    theme_sections: themeSections,
    closing_note: parsed.closing_note || '',
    next_steps: nextStepsBoilerplate(hotel.name),
    pricing: PRICING_TIERS,
    status: 'draft'
  };
}

module.exports = { runReportGeneration, buildReportPrompt, HOUSE_RULES };
