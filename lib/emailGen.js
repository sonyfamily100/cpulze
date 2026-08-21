// Generates outreach email copy from a set of ALREADY-VERIFIED-RUN findings
// the user selected by hand. This is deliberately a separate, small, cheap
// Claude call from the main verification pass — it only sees the specific
// findings selected, not the full 9-branch/corpus/consumer dataset.

const HOUSE_RULES = `
HOUSE RULES — apply to every email, every hotel, without exception:
- NEVER mention "corpus," "verification," "AI Mirror," or any internal methodology. The prospect should never learn how findings were checked, only what was found.
- Findings must read as something a real prospective guest could reproduce themselves by asking an AI assistant a plain, neutral question — not a leading or loaded one.
- Include exactly one short, subtle founder-credibility line: the sender spent roughly a decade at Amazon leading GenAI quality/evaluation work (Rufus, Alexa Shopping) — phrase it naturally, once, not as a resume dump.
- Immediately after the credibility line, include one sentence stating what the sender actually does: works with a small number of independent and boutique hotels to check what AI search tells prospective guests against what's real, and helps close the gap before it costs bookings. This is the offer — the email must state it plainly once, not just imply it.
- End with a soft, low-pressure ask for a short call. No pricing, no hard sell.
- Sign off with "[Your name]" on one line and "cpulze.com" on the line directly below it. Always include both lines.
- Keep the email under ~180 words excluding the signature block. Cold outreach that's too long doesn't get read.
- Never claim something is definitively true if its underlying findings are UNVERIFIABLE, DISPROVEN_IN_SAMPLE, CONTRADICTED, or FABRICATED — for those, frame it as "AI is telling prospective guests X" (a fact about what AI says) rather than asserting X is true. Only VERIFIED/THEME_VERIFIED findings can be stated with real confidence.
- Do not list findings exhaustively. Lead with the single strongest theme; at most gesture briefly at supporting themes in one sentence.
`.trim();

function buildEmailPrompt(hotel, selectedFindings) {
  const findingsSection = JSON.stringify(
    selectedFindings.map(f => ({
      id: f.id,
      part: f.part,
      theme: f.theme,
      engine: f.engine,
      source: f.source,
      claim_summary: f.claim_summary,
      verdict: f.verdict
    })),
    null, 2
  );

  return `You are drafting a single cold outreach email for cpulze, a service that helps hotel owners understand what AI search tools are telling prospective guests about their property.

Hotel: ${hotel.name} (${hotel.location})

${HOUSE_RULES}

SELECTED FINDINGS (the user has hand-picked these as candidates — you do not have to use all of them):
${findingsSection}

TASK:
1. Group the selected findings into themes based on their "theme" field / claim content (e.g. multiple Wi-Fi findings from different engines are one theme, even if worded differently).
2. For each theme, count how many DISTINCT engines (chatgpt/gemini/perplexity) and DISTINCT sources (api/consumer) independently support it. This is the "convergence strength" — a theme flagged by 3 engines independently is stronger evidence than one flagged by a single engine once.
3. Choose the STRONGEST 2 to 3 themes only, ranked by convergence strength first, then by verdict quality (VERIFIED/THEME_VERIFIED preferred over weaker verdicts). You MUST choose at least 2 themes and MUST NOT choose more than 3. Discard any selected findings that don't make the cut — the user selecting a finding does not obligate you to use it if a stronger theme exists.
4. Draft ONE email: lead with the single strongest theme in detail, then a brief single sentence gesturing at the remaining 1-2 supporting themes without listing them exhaustively. Follow the house rules exactly.

Output ONLY a JSON object with these keys:
- "themes_chosen": array of short theme labels (2-3 items)
- "convergence_reasoning": 2-3 sentences explaining why these themes were chosen over the others, referencing engine/source counts
- "subject": the email subject line
- "body": the full email body, using "[Name]" as a placeholder for the recipient and "[Your name]" for the sender, ending with the required "[Your name]" / "cpulze.com" signature block per the house rules

No prose outside the JSON.`;
}

async function runEmailGeneration(hotel, selectedFindings) {
  if (selectedFindings.length < 1) {
    throw new Error('At least one finding must be selected.');
  }
  const prompt = buildEmailPrompt(hotel, selectedFindings);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error(`Email generation call failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || []).map(b => b.text || '').join('\n');
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.body) {
      parsed.body = enforceSignature(parsed.body);
    }
    return parsed;
  } catch (e) {
    return { parse_error: e.message, raw_text: text };
  }
}

// The signature is fixed and never varies — don't leave it to the model's
// compliance every time. Strip whatever sign-off it produced and append the
// canonical one, guaranteeing it's always correct regardless of generation.
function enforceSignature(body) {
  const stripped = body.replace(/\[Your name\][\s\S]*$/i, '').trimEnd();
  return `${stripped}\n\n[Your name]\ncpulze.com`;
}

module.exports = { runEmailGeneration, buildEmailPrompt, HOUSE_RULES };