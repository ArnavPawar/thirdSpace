import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { palettes } from './palettes';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const css = readFileSync(join(__dirname, '..', 'global.css'), 'utf8');
const [lightBlock, darkBlock] = css.split('.dark:root');

const readVariables = (block: string) =>
  Object.fromEntries(Array.from(block.matchAll(/--([\w-]+):\s*(\d+) (\d+) (\d+);/g)).map(([, name, r, g, b]) => [
    name,
    `#${[r, g, b].map((channel) => Number(channel).toString(16).padStart(2, '0')).join('')}`,
  ]));

const toCssName = (key: string) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

for (const [scheme, block] of [['light', lightBlock], ['dark', darkBlock]] as const) {
  const variables = readVariables(block);
  for (const [key, value] of Object.entries(palettes[scheme])) {
    if (!value.startsWith('#')) continue;
    const cssValue = variables[toCssName(key)];
    if (cssValue === undefined) continue;
    assert(cssValue === value.toLowerCase(), `${scheme} ${key}: global.css has ${cssValue}, palettes.ts has ${value}`);
  }
  assert(Object.keys(variables).length >= 20, `${scheme} block in global.css looks incomplete`);
}

console.log('palette tests passed');
