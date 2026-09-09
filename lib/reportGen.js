// Generates the client-safe report draft from a set of ALREADY-VERIFIED-RUN
// findings the user selected by hand — same selection mechanism as
// emailGen.js, but assembled into a full multi-theme report instead of a
// single cold email.
//
// Two things are deliberately NOT left to the model, and are computed here
// in code instead:
//   - verbatim quotes for consumer-sourced findings — the exact text pasted
//     into the consumer-app grid, never re-paraphrased, so what the report
//     shows is provably what the AI actually said.
//   - the source citation — resolved from the finding's real corpus_refs
//     against the hotel's actual corpus rows (which carry real URLs), never
//     invented. Where nothing resolves, the report carries an explicit
//     "add manually" placeholder rather than a fabricated-looking link.
//
// The result is a DRAFT — the caller (server.js) stores it with
// status: 'draft' and it stays editable until explicitly approved, so
// nothing reaches a client without a human sign-off first.

const { canonicalizeTheme, matchThemeKey, THEMES: THEME_PAIRS } = require('./themes');
const {
  themeQuestion, PRICING, SERVICES, MASTER_BUNDLE, CALENDLY_URL, unlockCtaLine,
  nextStepsBoilerplate, normalizeSeverity, ACTION_TYPES
} = require('./reportTemplate');

const ENGINES = ['chatgpt', 'gemini', 'perplexity'];
const ENGINE_LABELS = { chatgpt: 'ChatGPT', gemini: 'Gemini', perplexity: 'Perplexity' };

const HOUSE_RULES = `
HOUSE RULES — apply to every section, every hotel, without exception:
- NEVER mention "corpus," "verification," "AI Mirror" as an internal process, verdict labels (VERIFIED/THEME_VERIFIED/UNVERIFIABLE/DISPROVEN_IN_SAMPLE/FABRICATED/CONTRADICTED), or any internal methodology term. The client should never learn how findings were checked, only what was found and how confident we are.
- Findings must read as something a real prospective guest could reproduce themselves by asking an AI assistant a plain, neutral question.
- "attribution" (how confident we are) must read as convincing and specific WITHOUT claiming certainty or calling itself "evidence" or "proof" — e.g. "Every independent read lines up on this, which is hard to explain away — even without being able to call it certain" rather than either "this is definitely true" or a hedgy "we couldn't confirm this."
- Never assert something is definitively true if the underlying finding was not well-supported.
- Keep every text field concise — this is a report the owner will actually read, not a wall of text.

WHAT CPULZE RECOMMENDS — and does not:
cpulze's entire value proposition is correcting the DIGITAL RECORD that AI models draw from — not consulting on hotel operations, staffing, or guest experience. NEVER suggest an operational fix, a staff-training step, a process audit, an "empower your front desk" line, or any general hospitality-management advice. Every action you recommend must be one of the five allowed action types below — nothing else.

ALLOWED ACTION TYPES (pick only the types that genuinely fit each theme — not all five every time):
- "website": a note on what to add/change on the hotel's OWN website, plus 2-4 short dated keyword phrases.
- "ota_listing": a note on what to change in an OTA listing field (Booking.com, Expedia, etc.) — different channel from the hotel's own site, so only include when there's something OTA-specific to fix.
- "article_correction": ONLY when it's plausible an outdated article or blog post is shaping the AI narrative — a note on what to find and request a correction/update for. Skip this type entirely when it doesn't plausibly apply.
- "review_reply": a ready-to-post reply to a guest review, in the hotel's own voice ("we"), built around 2-3 specific counter-keywords that push back on the negative sentiment. Bracket every invented date, quantity or amount — e.g. "[Month Year]", "[number] rooms", "£[amount]" — never invent a specific figure and present it as real. Still needs to read naturally once filled in.
- "owner_voice": a short, dated first-party log-entry — something the hotel's ownership would publish directly (not a reply to anyone), naming what changed and when. Bracket invented specifics the same way.
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

// Consumer-sourced findings already carry their exact wording in
// hotel.consumer_findings[engine][themeKey] — that's what the report shows
// verbatim, so Claude is told NOT to paraphrase those engines and is only
// asked to write responses_by_engine text for API-sourced ones.
//
// "Verbatim" means the substance is never reworded — it does NOT mean
// preserving copy-paste markdown syntax (**bold**) that was never meant to
// be read as literal asterisks. Stripping that formatting changes nothing
// about what was said, only how the paste artifacts render.
function stripMarkdownArtifacts(text) {
  return (text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function verbatimConsumerText(hotel, engine, themeKey) {
  const byEngine = hotel.consumer_findings && hotel.consumer_findings[engine];
  const text = byEngine && themeKey ? byEngine[themeKey] : undefined;
  return stripMarkdownArtifacts(text) || null;
}

function buildReportPrompt(hotel, selectedFindings) {
  const grouped = groupFindingsByTheme(selectedFindings);
  const themesSection = JSON.stringify(
    grouped.map(g => {
      return {
        theme: g.themeLabel,
        // response_key disambiguates cases where the SAME engine has both an
        // API-sourced and a consumer-sourced finding for this theme — both
        // must appear in the report, never silently collapsed into one slot,
        // so every finding gets its own stable, unique key to write against.
        findings: g.findings.map(f => {
          const responseKey = `${f.engine}_${f.source}`;
          const verbatimText = f.source === 'consumer' ? verbatimConsumerText(hotel, f.engine, g.themeKey) : null;
          return {
            response_key: responseKey,
            engine: f.engine,
            source: f.source,
            claim_summary: f.claim_summary,
            verdict: f.verdict,
            evidence: f.evidence,
            already_verbatim: !!verbatimText,
            // The full text is included ONLY so Claude can write a short
            // preview summary of it — the text itself is never reworded or
            // re-output, it's inserted verbatim separately in code.
            verbatim_text_for_summary_only: verbatimText || undefined
          };
        })
      };
    }),
    null, 2
  );

  return `You are drafting the content for a client-facing report for cpulze, a service that helps hotel owners understand what AI search tools are telling prospective guests about their property, verified against real guest reviews.

Hotel: ${hotel.name} (${hotel.location})

${HOUSE_RULES}

SELECTED FINDINGS, GROUPED BY THEME (the user has hand-picked these as the ones worth reporting on). EVERY finding must be represented in your output — use its exact "response_key" as the object key everywhere below, never the bare engine name (two findings can share an engine within one theme, e.g. one from the API pipeline and one pasted from the consumer app — they still need separate entries). Findings marked "already_verbatim": true will be shown to the client in their exact original wording — do not write a responses_by_engine entry for those, they're filled in separately. Where "verbatim_text_for_summary_only" is present, it exists ONLY so you can write a short preview of it — never repeat, quote, or rework that text anywhere in your output:
${themesSection}

TASK: For EACH theme listed above, produce one section:
- "severity": exactly one of "critical" | "high" | "watch". critical = a confirmed or strongly-supported pattern that materially damages first impressions or trust. high = a real, evidenced concern that's narrower or less severe. watch = minor, inconsistent, or largely unconfirmed — worth monitoring, not urgent.
- "root_cause": 1-2 sentences on WHY this is probably happening — an informed, specific read (e.g. what kind of source material is likely driving it), not a vague guess, but framed as a read rather than a fact.
- "responses_by_engine": object keyed by each finding's exact "response_key", ONE short sentence each, ONLY for findings that are NOT already_verbatim.
- "verbatim_summaries": object keyed by each finding's exact "response_key", ONLY for findings that ARE already_verbatim — ONE plain sentence previewing what that full response says (not a quote, a preview), since the full text is shown separately behind a "show more" toggle.
- "attribution": ONE sentence per the house rules above — confident and specific, not claiming certainty.
- "actions": array of { "type": one of website/ota_listing/article_correction/review_reply/owner_voice, "content": string, "keywords": array of strings (only for "website" and "review_reply" types) }. Pick 2-4 action types that genuinely fit this theme — do not force all five.

Also write:
- "executive_summary": 4-6 sentences overview of what this report covers overall, for the hotel owner, in plain language, leading with the single most important theme. Purely descriptive of what AI is currently saying — no advice here, that belongs in each theme's actions.
- "closing_note": 1-2 sentences transitioning into next steps (no pricing, no call-to-action — those are added separately).

Output ONLY a JSON object with these keys:
- "executive_summary": string
- "theme_sections": array of { "theme": string (must exactly match one of the theme names given above), "severity": string, "root_cause": string, "responses_by_engine": object, "verbatim_summaries": object, "attribution": string, "actions": array }
- "closing_note": string

No prose outside the JSON.`;
}

// Resolves a theme's citation from the REAL corpus, never invented: takes
// the first selected finding (for this theme) with a corpus_ref that
// matches an actual corpus row carrying a URL. Where nothing resolves, the
// report carries an explicit manual placeholder instead of guessing.
function resolveSource(themeFindings, corpus) {
  const corpusById = {};
  (corpus || []).forEach((r, i) => { corpusById[r.id || (i + 1)] = r; });

  for (const f of themeFindings) {
    for (const refId of (f.corpus_refs || [])) {
      const row = corpusById[refId];
      if (row && row.url) {
        const bits = [row.reviewer, row.date, row.title].filter(Boolean).join(' · ');
        return { type: 'corpus', url: row.url, label: bits || row.url };
      }
    }
  }
  return { type: 'manual', url: '', label: '' };
}

// The AI Perception Map — a 12-theme x 3-engine grid built from what this
// verification run ACTUALLY contains, never a hardcoded "36." A cell is
// "open" (selected, shown in full), "locked" (a real finding exists but
// wasn't selected for this report), or "empty" (nothing was ever found for
// that combination — rendered as neutral, never as a lock, since implying
// hidden content that doesn't exist would be dishonest).
function buildPerceptionMap(allRunFindings, selectedFindings, severityByThemeKey) {
  const canonicalThemes = THEME_PAIRS.map(([key, label]) => ({ key, label }));
  const selectedIds = new Set(selectedFindings.map(f => f.id));

  const cellFindings = {}; // "themeKey|engine" -> findings[]
  (allRunFindings || []).forEach(f => {
    const key = matchThemeKey(f.theme);
    if (!key || !ENGINES.includes(f.engine)) return;
    const cellKey = key + '|' + f.engine;
    (cellFindings[cellKey] = cellFindings[cellKey] || []).push(f);
  });

  let totalChecked = 0;
  let unlockedCount = 0;
  const rows = canonicalThemes.map(({ key, label }) => {
    const cells = ENGINES.map(engine => {
      const findings = cellFindings[key + '|' + engine] || [];
      if (!findings.length) return { status: 'empty' };
      totalChecked++;
      const isOpen = findings.some(f => selectedIds.has(f.id));
      if (isOpen) {
        unlockedCount++;
        return { status: 'open', severity: severityByThemeKey[key] || 'watch' };
      }
      return { status: 'locked' };
    });
    return { theme: label, cells };
  });

  return { rows, engines: ENGINES.map(e => ENGINE_LABELS[e]), totalChecked, unlockedCount };
}

async function runReportGeneration(hotel, selectedFindings, allRunFindings) {
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

  const grouped = groupFindingsByTheme(selectedFindings);
  const groupedByKey = {};
  grouped.forEach(g => { groupedByKey[g.themeKey || g.themeLabel] = g; });

  const severityByThemeKey = {};
  const themeSections = (Array.isArray(parsed.theme_sections) ? parsed.theme_sections : []).map(s => {
    const themeKey = matchThemeKey(s.theme);
    const themeLabel = canonicalizeTheme(s.theme);
    const group = groupedByKey[themeKey] || groupedByKey[themeLabel] || { findings: [] };
    const severity = normalizeSeverity(s.severity);
    if (themeKey) severityByThemeKey[themeKey] = severity;

    // Quotes: verbatim for consumer-sourced findings (never re-paraphrased),
    // Claude's paraphrase for API-sourced ones. Keyed per FINDING (engine +
    // source), not per engine alone — a theme can carry both an API-sourced
    // and a consumer-sourced finding from the same engine, and both must
    // appear rather than one silently overwriting the other. De-duplicates
    // only when two findings genuinely share both engine and source.
    const quoteMap = new Map();
    group.findings.forEach(f => {
      const key = `${f.engine}_${f.source}`;
      if (quoteMap.has(key)) return;
      if (f.source === 'consumer') {
        const verbatim = verbatimConsumerText(hotel, f.engine, themeKey);
        if (verbatim) {
          const summary = (s.verbatim_summaries && s.verbatim_summaries[key]) || '';
          quoteMap.set(key, { engine: f.engine, mode: 'verbatim', text: verbatim, summary });
          return;
        }
      }
      if (s.responses_by_engine && s.responses_by_engine[key]) {
        quoteMap.set(key, { engine: f.engine, mode: 'summarized', text: s.responses_by_engine[key] });
      }
    });
    const quotes = Array.from(quoteMap.values());

    const actions = (Array.isArray(s.actions) ? s.actions : [])
      .filter(a => a && ACTION_TYPES[a.type])
      .map(a => ({
        type: a.type,
        label: ACTION_TYPES[a.type].label,
        content: a.content || '',
        keywords: Array.isArray(a.keywords) ? a.keywords.filter(Boolean) : []
      }));

    return {
      theme: themeLabel,
      question_asked: themeQuestion(themeKey, hotel.name),
      severity,
      root_cause: s.root_cause || '',
      quotes,
      source: resolveSource(group.findings, hotel.corpus),
      attribution: s.attribution || '',
      actions
    };
  });

  const perceptionMap = buildPerceptionMap(allRunFindings || selectedFindings, selectedFindings, severityByThemeKey);

  return {
    hotel_name: hotel.name,
    hotel_location: hotel.location,
    executive_summary: parsed.executive_summary || '',
    theme_sections: themeSections,
    closing_note: parsed.closing_note || '',
    next_steps: nextStepsBoilerplate(hotel.name),
    perception_map: perceptionMap,
    unlock_cta: unlockCtaLine(),
    pricing: PRICING,
    services: SERVICES,
    master_bundle: MASTER_BUNDLE,
    calendly_url: CALENDLY_URL,
    status: 'draft'
  };
}

module.exports = { runReportGeneration, buildReportPrompt, buildPerceptionMap, resolveSource, HOUSE_RULES };
