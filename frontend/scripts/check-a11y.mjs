// Guarda contra regressão de acessibilidade: todo botão só de ícone (ion-button com
// slot="icon-only" ou <button class="icon-btn">) precisa de aria-label -- o title sozinho não é lido
// de forma confiável por leitor de tela no celular. Roda antes do `npm test`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../src/app/', import.meta.url).pathname;
const BUTTON = /<(ion-button|button)\b([^>]*)>([\s\S]*?)<\/\1>/g;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if ((name.endsWith('.html') || name.endsWith('.ts')) && !name.endsWith('.spec.ts')) yield path;
  }
}

const problems = [];
for (const file of walk(ROOT)) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(BUTTON)) {
    const [, , attrs, inner] = match;
    const iconOnly = inner.includes('slot="icon-only"') || /class="[^"]*\bicon-btn\b/.test(attrs);
    if (iconOnly && !attrs.includes('aria-label')) {
      const line = source.slice(0, match.index).split('\n').length;
      problems.push(`${relative(ROOT, file)}:${line}`);
    }
  }
}

if (problems.length) {
  console.error('Botões só de ícone sem aria-label:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('check-a11y: todos os botões de ícone têm aria-label.');
