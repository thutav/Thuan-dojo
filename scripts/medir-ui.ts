/**
 * Mede a resposta da interface e compara duas versões do build.
 *
 * Sem número, "está mais rápido" é opinião. Este script cronometra os três caminhos que
 * pesavam — montar a lista, passar o mouse por ela e digitar na busca — e roda o mesmo
 * roteiro contra a versão publicada e contra a atual.
 *
 *   npm run build && npx tsx scripts/medir-ui.ts [--contra <dir>]
 */
import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';

const raiz = fileURLToPath(new URL('..', import.meta.url));

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

function servir(dir: string, porta: number): Server {
  return createServer((req, res) => {
    const u = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let arquivo = path.join(dir, u === '/' ? 'index.html' : u);
    if (!arquivo.startsWith(dir) || !existsSync(arquivo)) arquivo = path.join(dir, 'index.html');
    res.setHeader('Content-Type', TIPOS[path.extname(arquivo)] ?? 'application/octet-stream');
    res.end(readFileSync(arquivo));
  }).listen(porta);
}

interface Medida {
  primeiroCard: number;
  cardsNoDom: number;
  nosNoDom: number;
  hover: number;
  digitar: number;
}

async function medir(navegador: Browser, url: string): Promise<Medida> {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await contexto.newPage();

  const inicio = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.card', { timeout: 20_000 });
  const primeiroCard = Date.now() - inicio;

  await page.waitForTimeout(700);
  const cardsNoDom = await page.locator('.card').count();
  const nosNoDom = await page.evaluate(() => document.querySelectorAll('*').length);

  // Passar o mouse pela lista: é o gesto de quem está varrendo resultados, e era ele que
  // reconstruía a camada de pinos do mapa inteira a cada card.
  const alvos = Math.min(cardsNoDom, 18);
  const t1 = Date.now();
  for (let i = 0; i < alvos; i++) {
    await page.locator('.card').nth(i).hover();
  }
  const hover = Date.now() - t1;

  // Digitar na busca, tecla por tecla, e esperar a lista refletir.
  const campo = page.locator('.campo-busca input');
  await campo.click();
  const t2 = Date.now();
  await page.keyboard.type('perequê', { delay: 0 });
  await page
    .waitForFunction(() => location.search.includes('q='), null, { timeout: 5000 })
    .catch(() => null);
  const digitar = Date.now() - t2;

  await contexto.close();
  return { primeiroCard, cardsNoDom, nosNoDom, hover, digitar };
}

function linha(nome: string, a: number, b: number | null, unidade = 'ms') {
  const esq = `${a}${unidade}`.padStart(9);
  if (b === null) {
    console.log(`  ${nome.padEnd(34)}${esq}`);
    return;
  }
  const dir = `${b}${unidade}`.padStart(9);
  const razao = b === 0 ? '—' : `${(a / b).toFixed(1)}×`;
  console.log(`  ${nome.padEnd(34)}${esq}${dir}   ${razao}`);
}

async function main() {
  const arg = process.argv.indexOf('--contra');
  const antigo = arg > 0 ? path.resolve(process.argv[arg + 1]) : null;
  const atual = path.join(raiz, 'ilhabela');

  const binario = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
  const navegador = await chromium.launch(existsSync(binario) ? { executablePath: binario } : {});

  const servidorAtual = servir(atual, 4321);
  const servidorAntigo = antigo ? servir(antigo, 4322) : null;

  const depois = await medir(navegador, 'http://127.0.0.1:4321/');
  const antes = servidorAntigo ? await medir(navegador, 'http://127.0.0.1:4322/') : null;

  console.log(
    antes
      ? `\n  ${''.padEnd(34)}${'antes'.padStart(9)}${'depois'.padStart(9)}   ganho`
      : '\n  medição da versão atual',
  );
  linha('primeiro resultado na tela', antes?.primeiroCard ?? depois.primeiroCard, antes ? depois.primeiroCard : null);
  linha('cards montados de saída', antes?.cardsNoDom ?? depois.cardsNoDom, antes ? depois.cardsNoDom : null, '');
  linha('nós no DOM', antes?.nosNoDom ?? depois.nosNoDom, antes ? depois.nosNoDom : null, '');
  linha('passar o mouse por 18 cards', antes?.hover ?? depois.hover, antes ? depois.hover : null);
  linha('digitar 7 letras na busca', antes?.digitar ?? depois.digitar, antes ? depois.digitar : null);
  console.log();

  await navegador.close();
  servidorAtual.close();
  servidorAntigo?.close();
}

main();
