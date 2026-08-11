import fs from 'node:fs';
import path from 'node:path';

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Usage: node scripts/sync-deck-content.mjs <pitch-deck.md>');

const root = process.cwd();
const source = fs.readFileSync(sourcePath, 'utf8');

function inlineMarkdown(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
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
    if (bullet && current) current.bullets.push(bullet[1].trim());
  }
  return slides;
}

const appendixStart = source.indexOf('# **Appendix**');
const mainSource = source.slice(0, appendixStart);
const appendixSource = source.slice(appendixStart);
const mainSlides = parseSlides(mainSource, /^###\s+\*\*Slide \d+:\s*(.+?)\*\*\s*$/);
const appendixSlides = parseSlides(appendixSource, /^##\s+\*\*A\d+:\s*(.+?)\*\*\s*$/);

if (mainSlides.length !== 12 || appendixSlides.length !== 18) {
  throw new Error(`Expected 12 main and 18 appendix slides; got ${mainSlides.length} and ${appendixSlides.length}`);
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

const mainPath = path.join(root, 'index.html');
let mainHtml = fs.readFileSync(mainPath, 'utf8');
mainHtml = replaceSlideCopy(mainHtml, mainSlides);
mainHtml = mainHtml
  .replace('<p style="padding-top: 10px;">Open Wallet Infrastructure</p>', '<p style="padding-top: 10px;">Integrations into distribution</p>')
  .replace('Salmon Wallet — Community-Owned Wallet Deck', 'Salmon Wallet — Investor Deck')
  .replace('Salmon is the community-owned wallet infrastructure. Discover how we\'re building the future of decentralized wallet layers.', 'Salmon turns selected integrations into activation, usage, and measurable distribution.');
fs.writeFileSync(mainPath, mainHtml);

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

console.log(`Synced ${mainSlides.length} main slides and ${appendixSlides.length} appendix slides from ${sourcePath}`);
