import fs from 'node:fs';
import path from 'node:path';

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Usage: node scripts/sync-deck-content.mjs <pitch-deck.md>');

const root = process.cwd();
const source = fs.readFileSync(sourcePath, 'utf8');

function inlineMarkdown(text) {
  return text
    .replace(/\\([~*_])/g, '$1')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function parseSlides(markdown, headingPattern) {
  const lines = markdown.split(/\r?\n/);
  const slides = [];
  let current = null;
  for (const line of lines) {
    const match = line.match(headingPattern);
    if (match) {
      current = { title: match[1].trim(), bullets: [] };
      slides.push(current);
      continue;
    }
    const bullet = line.match(/^\s*\*\s+(.+)/);
    if (bullet && current) {
      current.bullets.push(bullet[1].trim());
      continue;
    }
    const paragraph = line.trim();
    if (
      current &&
      paragraph &&
      !paragraph.startsWith('#') &&
      !/^---+$/.test(paragraph)
    ) {
      current.bullets.push(paragraph);
    }
  }
  return slides;
}

const appendixStart = source.indexOf('# **Appendix**');
const mainSource = source.slice(0, appendixStart);
const appendixSource = source.slice(appendixStart);
const mainSlides = parseSlides(mainSource, /^#{2,3}\s+\*\*Slide \d+:\s*(.+?)\*\*\s*$/);
const appendixSlides = parseSlides(appendixSource, /^##\s+\*\*A\d+:\s*(.+?)\*\*\s*$/);

if (mainSlides.length !== 13 || appendixSlides.length !== 18) {
  throw new Error(`Expected 13 main and 18 appendix slides; got ${mainSlides.length} and ${appendixSlides.length}`);
}

function replaceSlideCopy(html, slides) {
  let index = 0;
  return html.replace(
    /<h2 class="reveal">[\s\S]*?<\/h2>\s*<ul class="bullet-list">[\s\S]*?<\/ul>/g,
    () => {
      const slide = slides[index++];
      if (!slide) return '';
      const bullets = slide.bullets
        .map((bullet) => `                    <li class="reveal">${inlineMarkdown(bullet)}</li>`)
        .join('\n');
      return `<h2 class="reveal">${inlineMarkdown(slide.title)}</h2>\n                <ul class="bullet-list">\n${bullets}\n                </ul>`;
    },
  );
}

function renderArrowFlows(html) {
  return html.replace(
    /<li class="reveal">([^<]*?)<strong>([^<]*→[^<]*)<\/strong><\/li>/g,
    (match, _intro, sequence) => {
      if (/[,.]/.test(sequence)) return match;
      const steps = sequence
        .split('→')
        .map((step) => step.trim())
        .filter(Boolean)
        .map((step) => `<span class="flow-step">${step}</span>`)
        .join('<span class="flow-arrow" aria-hidden="true">→</span>');
      return `<li class="reveal flow-item"><div class="flow-diagram" role="img" aria-label="${sequence.trim()}">${steps}</div></li>`;
    },
  );
}

// The main deck uses bespoke data visualizations and asymmetric layouts.
// Keep its HTML hand-authored so a text sync cannot flatten those structures.
const mainPath = path.join(root, 'index.html');
const mainHtml = fs.readFileSync(mainPath, 'utf8');
const mainSectionCount = (mainHtml.match(/<section class="slide/g) || []).length;
if (mainSectionCount !== mainSlides.length) {
  throw new Error(`Main HTML has ${mainSectionCount} slides; markdown has ${mainSlides.length}`);
}

const appendixPath = path.join(root, 'Salmon-Appendix.html');
let appendixHtml = fs.readFileSync(appendixPath, 'utf8');
const sections = [...appendixHtml.matchAll(/\s*<!-- Slide A\d+:[\s\S]*?<section class="slide[\s\S]*?<\/section>/g)].map((match) => match[0]);
if (sections.length !== 11 && sections.length !== 18) {
  throw new Error(`Expected 11 or 18 existing appendix sections; got ${sections.length}`);
}

const template = sections.at(-1);
for (let i = sections.length; i < appendixSlides.length; i += 1) {
  const n = i + 1;
  const cloned = template
    .replace(/<!-- Slide A11:[^>]*-->/, `<!-- Slide A${n}: ${appendixSlides[i].title} -->`)
    .replace('id="slide-11"', `id="slide-${n}"`)
    .replace('<div class="slide-number">A11</div>', `<div class="slide-number">A${n}</div>`)
    .replaceAll('A-accent-11', `A-accent-${n}`)
    .replaceAll('Ablur11', `Ablur${n}`);
  sections.push(cloned);
}

const firstSectionStart = appendixHtml.indexOf(sections[0]);
const finalExistingSection = sections.at(-1);
const lastSectionEnd = appendixHtml.indexOf(finalExistingSection) + finalExistingSection.length;
let newSections = sections.join('\n');
newSections = replaceSlideCopy(newSections, appendixSlides);
appendixHtml = appendixHtml.slice(0, firstSectionStart) + newSections + appendixHtml.slice(lastSectionEnd);
appendixHtml = appendixHtml
  .replace('Salmon Wallet — Community-Owned Wallet Appendix', 'Salmon Wallet — Investor Deck Appendix')
  .replace('Deep dive into Salmon\'s modular architecture and security systems.', 'Details on Salmon\'s product, integrations, distribution, funding, roadmap, and governance readiness.');
fs.writeFileSync(appendixPath, appendixHtml);

const normalizedMarkdown = source
  .split(/\r?\n/)
  .map((line) => line.trimEnd())
  .join('\n')
  .trimEnd() + '\n';
fs.writeFileSync(path.join(root, 'salmon-deck.md'), normalizedMarkdown);

console.log(`Verified ${mainSlides.length} main slides and synced ${appendixSlides.length} appendix slides from ${sourcePath}`);
