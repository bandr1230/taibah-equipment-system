import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const signatureParts = [
  'BJ-TEIP-2026-SOURCE-SIGNATURE',
  'Bandar bin Khalaf Aljabri',
  'بندر بن خلف الجابري'
];

const files = [
  'app.js',
  'data.js',
  'need-engine.js',
  'ai-analyzer.js',
  'supabase-adapter.js',
  'public-asset.js',
  'service-worker.js',
  'index.html',
  'public-asset.html',
  'style.css',
  'supabase_schema.sql'
];

const missing = [];

for (const file of files) {
  const full = join(root, file);
  if (!existsSync(full)) {
    missing.push(`${file}: file missing`);
    continue;
  }
  const content = readFileSync(full, 'utf8');
  const absentParts = signatureParts.filter((part) => !content.includes(part));
  if (absentParts.length) {
    missing.push(`${file}: missing ${absentParts.join(', ')}`);
  }
}

if (missing.length) {
  console.error('Ownership signature verification failed:');
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`Ownership signature verified in ${files.length} source files.`);
