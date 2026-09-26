// Builds dist/artifact.html: the page body published as a claude.ai artifact.
// The artifact host wraps the page in its own <!doctype><html><head><body>
// skeleton, so this file holds only the content (title, styles, root, script),
// referencing the built assets that are published alongside it.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const pick = (re) => [...html.matchAll(re)].map((m) => m[0]);

const title = pick(/<title>[^<]*<\/title>/g)[0];
const fonts = pick(/<link[^>]+href="https:\/\/fonts\.googleapis\.com\/css2[^>]+>/g);
const css = pick(/<link rel="stylesheet"[^>]*href="\.\/assets\/[^"]+\.css"[^>]*>/g);
const js = pick(/<script type="module"[^>]*src="\.\/assets\/[^"]+\.js"[^>]*><\/script>/g);
if (!title || !fonts.length || !css.length || !js.length) throw new Error('Unexpected dist/index.html shape');

// Local assets are same-origin: drop Vite's crossorigin attribute.
const local = (tags) => tags.map((t) => t.replace(/ crossorigin/g, ''));
const page = [title, ...fonts, ...local(css), '<div id="root"></div>', ...local(js)].join('\n') + '\n';
writeFileSync('dist/artifact.html', page);

// The artifact host rejects files containing a literal U+FFFD. The bundle has
// one inside a string literal (marked's entity decoder); the � escape is
// the same value.
for (const f of readdirSync('dist/assets').filter((f) => f.endsWith('.js'))) {
  const path = `dist/assets/${f}`;
  const src = readFileSync(path, 'utf8');
  if (src.includes('�')) writeFileSync(path, src.replaceAll('�', '\\uFFFD'));
}

const files = Object.fromEntries(readdirSync('dist/assets').map((f) => [`assets/${f}`, `dist/assets/${f}`]));
writeFileSync('dist/artifact-files.json', JSON.stringify(files, null, 2));
console.log(page);
console.log(files);
