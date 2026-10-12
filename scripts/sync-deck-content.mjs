import fs from 'node:fs';
import path from 'node:path';

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Usage: node scripts/sync-deck-content.mjs <investor-deck.md>');

const root = process.cwd();
const source = fs.readFileSync(sourcePath, 'utf8');
const mainStart = source.indexOf('# Main Deck');
const appendixStart = source.indexOf('# Appendix — Information for Investor Evaluation');

if (mainStart < 0 || appendixStart < 0) {
  throw new Error('Expected Main Deck and investor evaluation appendix headings');
}

const mainSource = source.slice(mainStart, appendixStart);
const appendixSource = source.slice(appendixStart);
const mainSlides = [...mainSource.matchAll(/^##\s+(\d+)\.\s+(.+)$/gm)];
const appendixSlides = [...appendixSource.matchAll(/^##\s+A(\d+)\.\s+(.+)$/gm)];

if (mainSlides.length !== 12 || appendixSlides.length !== 12) {
  throw new Error(`Expected 12 main and 12 appendix slides; got ${mainSlides.length} and ${appendixSlides.length}`);
}

const mainHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mainSectionCount = (mainHtml.match(/<section class="slide/g) || []).length;
if (mainSectionCount !== 13) {
  throw new Error(`Expected cover plus 12 main slides; found ${mainSectionCount} sections`);
}

const appendixHtml = fs.readFileSync(path.join(root, 'Salmon-Appendix.html'), 'utf8');
const runtimeAppendixCount = (appendixHtml.match(/^\s*title:\s*'/gm) || []).length;
if (runtimeAppendixCount !== 12) {
  throw new Error(`Expected 12 runtime appendix definitions; found ${runtimeAppendixCount}`);
}

const normalized = source
  .split(/\r?\n/)
  .map(line => line.trimEnd())
  .join('\n')
  .trimEnd() + '\n';

fs.writeFileSync(path.join(root, 'salmon-deck.md'), normalized);
console.log('Verified cover + 12 main slides and 12 appendix slides; synced salmon-deck.md');
