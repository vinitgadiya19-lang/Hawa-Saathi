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

test('Layout stability audit: dvh units, scrollbar-gutter, body scroll lock, skeletons, and single-axis scroll', () => {
  const indexCss = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');
  const homeTsx = fs.readFileSync(path.join(ROOT, 'src/components/HomeScreen.tsx'), 'utf8');
  const chatTsx = fs.readFileSync(
    path.join(ROOT, 'src/components/FloatingChatWidget.tsx'),
    'utf8'
  );
  const indoorTsx = fs.readFileSync(
    path.join(ROOT, 'src/components/family/IndoorAirHacksSection.tsx'),
    'utf8'
  );
  const chartTsx = fs.readFileSync(
    path.join(ROOT, 'src/components/HourlyBarChart.tsx'),
    'utf8'
  );

  // Zero fragile vh/h-screen units anywhere in src/
  const srcFiles = collectFiles(path.join(ROOT, 'src'), ['.ts', '.tsx', '.css']);
  for (const filePath of srcFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.doesNotMatch(
      content,
      /\b100vh\b|\b80vh\b|\bh-screen\b|\bmin-h-screen\b/,
      `Legacy vh/h-screen unit found in ${path.relative(ROOT, filePath)}`
    );
  }

  // Global CSS stability guarantees
  assert.match(indexCss, /min-height:\s*100dvh/);
  assert.match(indexCss, /scrollbar-gutter:\s*stable/);
  assert.match(indexCss, /overflow-x:\s*clip/);
  assert.match(indexCss, /overflow-anchor:\s*auto/);
  assert.match(indexCss, /scroll-behavior:\s*smooth/);
  assert.match(indexCss, /@keyframes\s+panelReveal/);

  // Chat widget uses 80dvh, body scroll lock, and container-scoped scrollTo (not outer scrollIntoView)
  assert.match(chatTsx, /80dvh/);
  assert.match(chatTsx, /useBodyScrollLock/);
  assert.doesNotMatch(chatTsx, /scrollIntoView/);

  // Collapsible indoor air hacks uses compositor-only reveal, not height animation
  assert.doesNotMatch(indoorTsx, /motion\/react/);
  assert.match(indoorTsx, /panel-reveal/);

  // Loading skeletons reserve space matching loaded sections
  assert.match(homeTsx, /AirQualityLoadingSkeleton/);
  assert.match(homeTsx, /FamilyPlanSkeleton/);
  assert.match(homeTsx, /min-h-dvh/);

  // Horizontal scroll wrappers explicitly lock overflow-y to prevent nested vertical scrollbars
  assert.match(chartTsx, /overflow-x-auto overflow-y-hidden/);
});
