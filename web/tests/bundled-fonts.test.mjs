import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
// Use the same font parser as next/font/local, including WOFF2 decoding.
const parseFont = require('next/dist/compiled/@next/font/dist/fontkit').default;
const directory = new URL('../app/fonts/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('sources.json', directory), 'utf8'));
const layout = ts.createSourceFile('layout.tsx', readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

test('every bundled font decodes, retains ordinary text coverage, and matches its recorded hash', () => {
  assert.equal(manifest.fonts.length, 20);
  for (const entry of manifest.fonts) {
    const bytes = readFileSync(new URL(entry.file, directory));
    assert.equal(bytes.subarray(0, 4).toString(), 'wOF2', entry.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.file);
    const font = parseFont(bytes);
    assert.ok(font.numGlyphs > 100, entry.file);
    for (const character of 'Subwave 0123456789é') {
      assert.ok(font.hasGlyphForCodePoint(character.codePointAt(0)), `${entry.file}: ${character}`);
    }
  }
});

test('all font families ship their original license and pinned source attribution', () => {
  const families = new Set(manifest.fonts.map(entry => entry.family));
  assert.equal(families.size, 14);
  for (const family of families) {
    assert.match(readFileSync(new URL(`${family}/OFL.txt`, directory), 'utf8'), /SIL OPEN FONT LICENSE/i);
  }
  for (const entry of manifest.fonts) {
    assert.ok(entry.source.startsWith(`https://raw.githubusercontent.com/google/fonts/${manifest.upstreamCommit}/ofl/${entry.family}/`));
    assert.match(entry.sourceSha256, /^[a-f0-9]{64}$/);
  }
});

test('the layout loads every bundled asset locally and keeps all theme font variables', () => {
  const imports = layout.statements.filter(ts.isImportDeclaration).map(node => node.moduleSpecifier.text);
  assert.ok(imports.includes('next/font/local'));
  assert.ok(!imports.includes('next/font/google'), 'production builds must not fetch Google font CSS');
  const paths = [];
  const variables = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(layout) === 'localFont') {
      const options = node.arguments[0];
      assert.ok(ts.isObjectLiteralExpression(options));
      for (const prop of options.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        if (prop.name.getText(layout) === 'variable') variables.push(prop.initializer.text);
        if (prop.name.getText(layout) !== 'src') continue;
        if (ts.isStringLiteral(prop.initializer)) paths.push(prop.initializer.text);
        else for (const file of prop.initializer.elements) {
          paths.push(file.properties.find(item => item.name.getText(layout) === 'path').initializer.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(layout);
  assert.deepEqual(paths.map(path => path.replace('./fonts/', '')).sort(), manifest.fonts.map(entry => entry.file).sort());
  assert.deepEqual(variables.sort(), [
    '--font-fraunces', '--font-sans', '--font-jetbrains', '--font-doto',
    '--font-space-grotesk', '--font-instrument-serif', '--font-anton',
    '--font-chakra-petch', '--font-saira-stencil-one', '--font-ibm-plex-mono',
    '--font-space-mono', '--font-fira-code', '--font-courier-prime', '--font-overpass-mono',
  ].sort());
});
