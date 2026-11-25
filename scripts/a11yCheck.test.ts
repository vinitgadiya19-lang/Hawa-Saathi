import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function collectFiles(dir: string, exts: string[]): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      results.push(...collectFiles(full, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

test('Accessibility audit: skip links, main landmarks, aria-live, chart table, and reduced motion', () => {
  const homeTsx = fs.readFileSync(path.join(ROOT, 'src/components/HomeScreen.tsx'), 'utf8');
  const roleTsx = fs.readFileSync(
    path.join(ROOT, 'src/components/RoleSelectorScreen.tsx'),
    'utf8'
  );
  const chatTsx = fs.readFileSync(
    path.join(ROOT, 'src/components/FloatingChatWidget.tsx'),
    'utf8'
  );
  const chartTsx = fs.readFileSync(
    path.join(ROOT, 'src/components/HourlyBarChart.tsx'),
    'utf8'
  );
  const indexCss = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  // HTML document language & viewport
  assert.match(indexHtml, /<html lang="en">/);
  assert.match(indexHtml, /<title>.*Hawa Saathi.*<\/title>/);

  // Skip links & <main id="main-content"> landmarks on both primary screens
  assert.match(homeTsx, /href="#main-content"/);
  assert.match(homeTsx, /<main[^>]+id="main-content"/);
  assert.match(roleTsx, /href="#main-content"/);
  assert.match(roleTsx, /<main[^>]+id="main-content"/);

  // Aria-live polite announcements in chat and status updates
  assert.match(chatTsx, /aria-live="polite"/);
  assert.match(homeTsx, /aria-live="polite"/);
  assert.match(chartTsx, /aria-live="polite"/);

  // Chart provides accessible table alternative with caption and scoped headers
  assert.match(chartTsx, /<table/);
  assert.match(chartTsx, /<caption/);
  assert.match(chartTsx, /<th scope="col"/);

  // Reduced motion support in CSS and focus-visible styling
  assert.match(indexCss, /prefers-reduced-motion:\s*reduce/);
  assert.match(indexCss, /:focus-visible/);
});

test('Every form input and select has a label or aria-label, and zero unsafe DOM calls exist', () => {
  const tsxFiles = collectFiles(path.join(ROOT, 'src'), ['.tsx']);
  const unlabeled: string[] = [];

  for (const filePath of tsxFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.doesNotMatch(
      content,
      /dangerouslySetInnerHTML|window\.open|window\.alert/,
      `Unsafe DOM API found in ${path.relative(ROOT, filePath)}`
    );

    // Check every <input or <select tag block has id="..." (matched to htmlFor) or aria-label
    const controlMatches = content.match(/<(?:input|select)\b[\s\S]*?>/g) ?? [];
    for (const tag of controlMatches) {
      const hasAriaLabel = /\baria-label=|\baria-labelledby=/.test(tag);
      const idMatch = tag.match(/\bid="([^"]+)"/);
      const hasHtmlFor = idMatch
        ? new RegExp(`htmlFor="${idMatch[1]}"`).test(content)
        : false;
      if (!hasAriaLabel && !hasHtmlFor) {
        unlabeled.push(`${path.relative(ROOT, filePath)}: ${tag.slice(0, 60)}`);
      }
    }
  }

  assert.deepEqual(unlabeled, []);
});

test('Security hygiene: zero Google API key literals or VITE_GEMINI exposure in source', () => {
  const sourceFiles = [
    ...collectFiles(path.join(ROOT, 'src'), ['.ts', '.tsx']),
    ...collectFiles(path.join(ROOT, 'server'), ['.ts']),
  ].filter((filePath) => !filePath.endsWith('.test.ts'));

  for (const filePath of sourceFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.doesNotMatch(
      content,
      /AIza[0-9A-Za-z_-]{20,}/,
      `Hardcoded API key pattern found in ${path.relative(ROOT, filePath)}`
    );
    if (filePath.includes(`${path.sep}src${path.sep}`)) {
      assert.doesNotMatch(
        content,
        /GEMINI_API_KEY|VITE_GEMINI/,
        `Gemini key reference found in client source ${path.relative(ROOT, filePath)}`
      );
    }
  }
});
