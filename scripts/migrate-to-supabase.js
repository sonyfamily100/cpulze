// One-time migration: reads every hotel out of the local data/*.json files
// and upserts it into Supabase. Run once, after adding SUPABASE_URL and
// SUPABASE_SERVICE_KEY to .env:
//
//   node scripts/migrate-to-supabase.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../lib/db');

const DATA_DIR = path.join(__dirname, '..', 'data');

async function main() {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  if (!files.length) {
    console.log('no local hotel files found in data/ — nothing to migrate');
    return;
  }

  for (const file of files) {
    const hotel = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
    await db.saveHotel(hotel);
    console.log(`migrated ${hotel.id} — ${hotel.name}`);
  }

  console.log(`done — migrated ${files.length} hotel(s) to Supabase`);
}

main().catch(e => {
  console.error('migration failed:', e.message);
  process.exit(1);
});
