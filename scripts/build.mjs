import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const publicFiles = [
  ['/', 'index.html', 'text/html; charset=utf-8'],
  ['/style.css', 'style.css', 'text/css; charset=utf-8'],
  ['/app.js', 'app.js', 'text/javascript; charset=utf-8'],
  ['/assets/contest-sprites.png', 'assets/contest-sprites.png', 'image/png'],
  ['/assets/flames.png', 'assets/flames.png', 'image/png'],
  ['/assets/pickle.png', 'assets/pickle.png', 'image/png'],
  ['/images/search.svg', 'images/search.svg', 'image/svg+xml'],
  ['/images/voting-help.svg', 'images/voting-help.svg', 'image/svg+xml']
];

const entries = await Promise.all(publicFiles.map(async ([path, file, type]) => {
  const content = await readFile(new URL(`../public/${file}`, import.meta.url));
  const binary = type.startsWith('image/');
  const body = binary
    ? `Uint8Array.from(atob(${JSON.stringify(content.toString('base64'))}), c => c.charCodeAt(0))`
    : JSON.stringify(content.toString('utf8'));
  const cache = binary ? 'public, max-age=3600' : 'no-cache';
  return `  ${JSON.stringify(path)}: { type: ${JSON.stringify(type)}, cache: ${JSON.stringify(cache)}, body: () => ${body} }`;
}));

const source = await readFile(new URL('../worker/index.js', import.meta.url), 'utf8');
const dist = new URL('../dist/', import.meta.url);
await mkdir(new URL('server/', dist), { recursive: true });
await mkdir(new URL('.openai/', dist), { recursive: true });
await writeFile(new URL('server/index.js', dist), `const assets = {\n${entries.join(',\n')}\n};\n${source}`);
await copyFile(new URL('../.openai/hosting.json', import.meta.url), new URL('.openai/hosting.json', dist));
