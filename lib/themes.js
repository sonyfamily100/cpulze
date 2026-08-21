// Single source of truth for the 12-theme taxonomy. Both the consumer-app
// CSV importer (server.js) and the verification-finding normalizer
// (verify.js) key off this so "Wi-Fi" from one path and "wifi" from another
// always collapse to the same canonical label.

const THEMES = [
  ['staff', 'Staff'],
  ['room_quality', 'Room Quality'],
  ['cleanliness', 'Cleanliness'],
  ['dining', 'Dining'],
  ['checkin_out', 'Check-in/out'],
  ['value', 'Value'],
  ['noise', 'Noise'],
  ['maintenance', 'Maintenance'],
  ['wifi', 'Wi-Fi'],
  ['accessibility', 'Accessibility'],
  ['family_suitability', 'Family Suitability'],
  ['pricing_transparency', 'Pricing Transparency']
];

const THEME_LABELS = Object.fromEntries(THEMES);

// Aliases are matched against a normalized (lowercase, alphanumeric-only)
// string, so "Air Conditioning", "air-conditioning" and "aircon" all
// normalize to "airconditioning" before comparison.
const THEME_ALIASES = {
  staff: ['staff', 'service', 'employees'],
  room_quality: ['roomquality', 'room', 'rooms'],
  cleanliness: ['cleanliness', 'clean', 'hygiene'],
  dining: ['dining', 'food', 'restaurant', 'breakfast'],
  checkin_out: ['checkinout', 'checkin', 'checkout', 'frontdesk', 'reception'],
  value: ['value', 'valueformoney'],
  noise: ['noise', 'soundproofing'],
  maintenance: ['maintenance', 'repairs', 'aircon', 'airconditioning', 'hvac'],
  wifi: ['wifi', 'wireless', 'connectivity', 'internet'],
  accessibility: ['accessibility', 'disabled', 'wheelchair'],
  family_suitability: ['familysuitability', 'family', 'kids', 'children'],
  pricing_transparency: ['pricingtransparency', 'pricing', 'booking', 'fees', 'hiddenfees']
};

function normalize(s) {
  return (s || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Returns the canonical snake_case key (e.g. "room_quality") or null.
function matchThemeKey(rawLabel) {
  const n = normalize(rawLabel);
  if (!n) return null;
  for (const [key, aliases] of Object.entries(THEME_ALIASES)) {
    if (aliases.some(a => n.includes(a) || a.includes(n))) return key;
  }
  return null;
}

// Returns the canonical display label (e.g. "Room Quality") for any
// variant spelling/casing/underscore-style Claude or a CSV might produce.
// Falls back to the original string, trimmed, if nothing matches, rather
// than silently dropping unrecognized themes.
function canonicalizeTheme(rawLabel) {
  const key = matchThemeKey(rawLabel);
  if (key) return THEME_LABELS[key];
  return (rawLabel || '').toString().trim();
}

module.exports = { THEMES, THEME_LABELS, THEME_ALIASES, normalize, matchThemeKey, canonicalizeTheme };
