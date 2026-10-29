// Pacote da extensão para uma reunião em outro idioma (uso interno, carregar
// sem compactar no Chrome): transcreve no idioma da reunião, traduz para o
// português o que os outros disseram e sopra a frase no idioma da reunião.
//
//   node scripts/extensao-idioma.mjs --idioma es --outros PDA --contexto "..." [--saida dist-idioma]
//
// Troca só o `const VARIANTE = null;` do content.js e o nome/versão do
// manifest; o resto é a extensão da loja. Desative a extensão da loja enquanto
// usa esta (as duas entram no Meet).
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []));
const NOMES = { es: 'espanhol', en: 'inglês' };
const idioma = args.idioma;
if (!NOMES[idioma]) throw new Error('use --idioma es ou --idioma en');
const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const saida = path.resolve(raiz, args.saida || `dist-extensao-${idioma}`);
fs.rmSync(saida, { recursive: true, force: true });
fs.cpSync(path.join(raiz, 'extension'), saida, { recursive: true, filter: (f) => !f.endsWith('.md') });

const variante = { idioma, nomeIdioma: NOMES[idioma], outros: args.outros || 'Eles', contexto: args.contexto || '' };
const cs = path.join(saida, 'content.js');
const js = fs.readFileSync(cs, 'utf8');
if (!js.includes('const VARIANTE = null;')) throw new Error('content.js sem o ponto de troca da variante');
fs.writeFileSync(cs, js.replace('const VARIANTE = null;', `const VARIANTE = ${JSON.stringify(variante)};`));

const mf = path.join(saida, 'manifest.json');
const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
m.name = `Sales Coach (${NOMES[idioma]}, uso interno)`;
m.version = `${m.version}.900`;
m.description = `Coach ao vivo para reunião em ${NOMES[idioma]}: tradução para o português e a frase sugerida em ${NOMES[idioma]}.`;
delete m.key;
fs.writeFileSync(mf, JSON.stringify(m, null, 2) + '\n');

const zip = `${saida}.zip`;
fs.rmSync(zip, { force: true });
execFileSync('zip', ['-qr', zip, '.'], { cwd: saida });
console.log('ok', saida, zip);
