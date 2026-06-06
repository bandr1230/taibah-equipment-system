import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const jsFiles = [
  'app.js',
  'data.js',
  'ai-analyzer.js',
  'need-engine.js',
  'supabase-adapter.js',
  'service-worker.js'
];

function checkSyntax(file) {
  const full = join(root, file);
  if (!existsSync(full)) return;
  execFileSync(process.execPath, ['--check', full], { stdio: 'pipe' });
}

function localScriptPaths(htmlFile) {
  const full = join(root, htmlFile);
  if (!existsSync(full)) return [];
  const html = readFileSync(full, 'utf8');
  const matches = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)];
  return matches
    .map((match) => match[1].trim())
    .filter((src) => src && !/^https?:\/\//i.test(src) && !src.startsWith('data:'))
    .map((src) => src.split('?')[0].split('#')[0]);
}

function assertLocalScriptsExist(htmlFile) {
  const base = dirname(join(root, htmlFile));
  for (const src of localScriptPaths(htmlFile)) {
    const target = normalize(join(base, src));
    if (!target.startsWith(root)) {
      throw new Error(`${htmlFile} references a script outside the project: ${src}`);
    }
    if (!existsSync(target)) {
      throw new Error(`${htmlFile} references a missing script: ${src}`);
    }
  }
}

for (const file of jsFiles) checkSyntax(file);
assertLocalScriptsExist('index.html');
if (existsSync(join(root, 'www', 'index.html'))) {
  assertLocalScriptsExist(join('www', 'index.html'));
  checkSyntax(join('www', 'app.js'));
  checkSyntax(join('www', 'ai-analyzer.js'));
}

console.log('Smoke check passed: syntax and local script references are valid.');
