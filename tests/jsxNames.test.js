import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Every <Component> used in a .jsx file must be imported or defined in that
// file. (ESLint doesn't check this here, and a missing icon import can quietly
// pick up a browser built-in with the same name, like History or Navigation,
// and break the page.)

const files = [];
const walk = (dir) => readdirSync(dir).forEach((f) => {
  const p = join(dir, f);
  if (statSync(p).isDirectory()) walk(p);
  else if (p.endsWith('.jsx')) files.push(p);
});
walk('src');

const declared = (src, name) => {
  const n = name.replace(/[$]/g, '\\$');
  const patterns = [
    new RegExp(`import\\s+${n}\\b`), // default import
    new RegExp(`import\\s*(?:\\w+\\s*,\\s*)?\\{[^}]*\\b(?:\\w+\\s+as\\s+)?${n}\\b[^}]*\\}\\s*from`), // named import / alias
    new RegExp(`\\b(?:const|let|var|function|class)\\s+${n}\\b`),
    new RegExp(`\\b(?:const|let|var)\\s*[\\[{][^=;]*\\b${n}\\b[^=;]*[\\]}]\\s*=`), // destructuring
    new RegExp(`\\(\\s*\\{[^)]*\\b${n}\\b[^)]*\\}\\s*\\)\\s*=>`), // ({ icon: Icon }) =>
    new RegExp(`\\(\\s*\\[[^)]*\\b${n}\\b[^)]*\\]\\s*\\)\\s*=>`), // ([a, Icon]) =>
    new RegExp(`\\((?:[^()]*,)?\\s*${n}\\s*(?:,[^()]*)?\\)\\s*=>`), // (key, Icon, title) =>
  ];
  return patterns.some((re) => re.test(src));
};

describe('JSX components are imported or defined', () => {
  it.each(files)('%s', (file) => {
    const src = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const used = new Set([...src.matchAll(/<([A-Z][A-Za-z0-9_]*)(?=[\s/>])/g)].map((m) => m[1]));
    const missing = [...used].filter((name) => !declared(src, name));
    expect(missing).toEqual([]);
  });
});
