/**
 * Verificação de ponta a ponta do aplicativo construído.
 *
 * Sobe um servidor estático sobre ilhabela/, abre o Chromium e percorre os caminhos que
 * importam — os três modos, o coroplético, os filtros, a ficha, o comparador, o mercado, o
 * colar-anúncio e o layout de celular — exigindo zero erro de console em todos eles.
 *
 * Os screenshots ficam em verification/ (fora do controle de versão).
 *
 *   npm run build && npm run verify:ui
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type ConsoleMessage, type Page } from 'playwright';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const publico = path.join(raiz, 'ilhabela');
const saida = path.join(raiz, 'verification');
const PORTA = 4317;

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

function servir() {
  return createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let arquivo = path.join(publico, url === '/' ? 'index.html' : url);
    if (!arquivo.startsWith(publico) || !existsSync(arquivo)) {
      arquivo = path.join(publico, 'index.html');
    }
    res.setHeader('Content-Type', TIPOS[path.extname(arquivo)] ?? 'application/octet-stream');
    res.end(readFileSync(arquivo));
  }).listen(PORTA);
}

const problemas: string[] = [];
const checagens: string[] = [];

function conferir(condicao: boolean, descricao: string) {
  checagens.push(`${condicao ? '  ok ' : ' FALHA'}  ${descricao}`);
  if (!condicao) problemas.push(descricao);
}

async function foto(page: Page, nome: string) {
  await page.screenshot({ path: path.join(saida, `${nome}.png`) });
}

async function main() {
  mkdirSync(saida, { recursive: true });
  const servidor = servir();
  // O Chromium do ambiente pode não bater com a versão que o pacote do Playwright espera
  // baixar; quando existir um binário instalado, usamos ele em vez de tentar baixar outro.
  const binario = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
  const navegador = await chromium.launch(existsSync(binario) ? { executablePath: binario } : {});
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await contexto.newPage();

  const errosConsole: string[] = [];
  const externosFalhados: string[] = [];

  // Este ambiente de desenvolvimento não tem saída para a internet, então a fonte do Google
  // e os tiles do OpenStreetMap falham aqui — e é justamente por isso que o aplicativo foi
  // feito para funcionar sem eles. Falha de recurso externo é registrada, não reprovada;
  // qualquer outro erro reprova.
  page.on('requestfailed', (req) => {
    if (!req.url().startsWith(base)) externosFalhados.push(new URL(req.url()).host);
  });
  page.on('console', (msg: ConsoleMessage) => {
    const texto = msg.text();
    if (msg.type() !== 'error') return;
    if (/Failed to load resource/.test(texto)) return;
    errosConsole.push(texto);
  });
  page.on('pageerror', (e) => errosConsole.push(`pageerror: ${e.message}`));

  const base = `http://127.0.0.1:${PORTA}/`;
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('.card', { timeout: 15_000 });

  // ---- venda ------------------------------------------------------------
  const zonas = await page.locator('.leaflet-overlay-pane path').count();
  conferir(zonas > 28, `mapa desenhou o contorno e as zonas (${zonas} polígonos)`);
  const pinos = await page.locator('.pino-preco, .pino-grupo').count();
  conferir(pinos > 0, `pinos de preço no mapa (${pinos})`);
  conferir(await page.locator('.legenda').isVisible(), 'legenda do coroplético visível');
  const cards = await page.locator('.card').count();
  conferir(cards > 0, `lista com resultados (${cards} cards)`);

  // A faixa de demonstração e o selo "demo" só existem enquanto a coleta real não rodou.
  // Depois dela, o certo é justamente não aparecerem.
  const ehDemo = await page.locator('.faixa-demo').isVisible();
  const comSelo = await page.locator('.card .selo.demo').count();
  if (ehDemo) {
    conferir(comSelo > 0, 'base de demonstração: faixa de aviso e selo "demo" nos cards');
  } else {
    conferir(comSelo === 0, 'base real: nenhum aviso de demonstração na tela');
  }
  await foto(page, '01-venda');

  // ---- temporada --------------------------------------------------------
  await page.getByRole('button', { name: 'Temporada' }).click();
  await page.waitForTimeout(500);
  // Com dados reais, temporada pode estar vazia: nenhuma das fontes atuais anuncia diária.
  // Vazio é um estado legítimo e precisa ser explicado na tela, não um card em branco.
  if ((await page.locator('.card').count()) === 0) {
    const vazio = await page.locator('.vazio').textContent();
    conferir(
      (vazio ?? '').includes('temporada'),
      'sem anúncios de temporada, a tela explica em vez de ficar em branco',
    );
  } else {
    const precoTemporada = await page.locator('.card .por-m2').first().textContent();
    conferir(
      (precoTemporada ?? '').includes('noite') || (precoTemporada ?? '').includes('sem área'),
      `preço por m² da temporada usa a unidade certa (${precoTemporada?.trim()})`,
    );
  }
  await foto(page, '02-temporada');

  // ---- aluguel + métrica de contagem ------------------------------------
  await page.getByRole('button', { name: 'Alugar' }).click();
  await page.waitForTimeout(300);
  await page.selectOption('#metrica-mapa', 'n');
  await page.waitForTimeout(300);
  await foto(page, '03-aluguel-ofertas');

  await page.getByRole('button', { name: 'Comprar' }).click();
  await page.waitForTimeout(300);

  // ---- filtros -----------------------------------------------------------
  await page.getByRole('button', { name: 'Mais filtros…' }).click();
  await page.waitForSelector('[role="dialog"]');
  await foto(page, '04-filtros');
  await page.locator('#campo-Quartos').fill('3');
  await page.getByRole('button', { name: 'Ver resultados' }).click();
  await page.waitForTimeout(400);
  const depoisFiltro = await page.locator('.card').count();
  conferir(depoisFiltro > 0 && depoisFiltro <= cards, `filtro de quartos reduziu a lista (${depoisFiltro})`);
  conferir(page.url().includes('qt=3'), 'filtro entrou na URL para poder ser compartilhado');

  // ---- ficha -------------------------------------------------------------
  await page.locator('.card .miniatura').first().click();
  await page.waitForSelector('.ficha');
  conferir(await page.locator('.ficha').isVisible(), 'ficha do imóvel abre');
  await foto(page, '05-ficha');
  await page.locator('.rodape-modal').getByRole('button', { name: 'Comparar' }).click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  // ---- comparador --------------------------------------------------------
  await page.locator('.card').nth(1).hover();
  await page.locator('.card').nth(1).getByLabel('Adicionar à comparação').click();
  await page.locator('.acoes-cabecalho').getByRole('button', { name: /Comparar/ }).click();
  await page.waitForSelector('.tabela-comparacao');
  const colunas = await page.locator('.tabela-comparacao thead th').count();
  conferir(colunas >= 3, `comparador mostra os imóveis lado a lado (${colunas - 1} imóveis)`);
  conferir(
    (await page.locator('.tabela-comparacao td.melhor').count()) > 0,
    'comparador destaca o melhor valor de cada linha',
  );
  await foto(page, '06-comparador');
  await page.keyboard.press('Escape');

  // ---- mercado -----------------------------------------------------------
  await page.getByRole('button', { name: 'Mercado' }).click();
  await page.waitForSelector('.grade-mercado');
  const graficos = await page.locator('.tela-grafico canvas').count();
  conferir(graficos >= 3, `painel de mercado renderizou os gráficos (${graficos})`);
  const linhasRanking = await page.locator('.ranking-linha').count();
  conferir(linhasRanking > 0, `ranking de bairros por preço/m² (${linhasRanking} bairros)`);
  await foto(page, '07-mercado');
  await page.keyboard.press('Escape');

  // ---- colar anúncio -----------------------------------------------------
  await page.getByRole('button', { name: 'Colar anúncio' }).click();
  await page.waitForSelector('#texto-anuncio');
  await page.getByRole('button', { name: 'Usar um exemplo' }).click();
  await page.waitForTimeout(400);
  const precoLido = await page.locator('#f-preco').inputValue();
  conferir(precoLido === '1850000', `parser leu o preço do texto colado (${precoLido})`);
  const bairroLido = await page.locator('#f-bairro').inputValue();
  conferir(bairroLido === 'curral', `parser reconheceu o bairro (${bairroLido})`);
  const quartosLidos = await page.locator('#f-quartos').inputValue();
  conferir(quartosLidos === '3', `parser leu os quartos (${quartosLidos})`);
  await foto(page, '08-colar');
  await page.getByRole('button', { name: 'Salvar no meu mapa' }).click();
  await page.waitForSelector('.ficha');
  conferir(
    (await page.locator('.ficha').textContent())?.includes('Curral') ?? false,
    'anúncio colado entra na base e abre a ficha',
  );
  await page.keyboard.press('Escape');

  // ---- celular -----------------------------------------------------------
  const celular = await navegador.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const pageCelular = await celular.newPage();
  pageCelular.on('pageerror', (e) => errosConsole.push(`celular pageerror: ${e.message}`));
  await pageCelular.goto(base, { waitUntil: 'networkidle' });
  await pageCelular.waitForSelector('.aba-mobile');
  await pageCelular.screenshot({ path: path.join(saida, '09-celular-mapa.png') });
  await pageCelular.getByRole('button', { name: 'Lista' }).click();
  await pageCelular.waitForSelector('.card');
  conferir(await pageCelular.locator('.card').first().isVisible(), 'no celular a lista abre pela aba');
  await pageCelular.screenshot({ path: path.join(saida, '10-celular-lista.png') });

  conferir(errosConsole.length === 0, `nenhum erro de console (${errosConsole.length})`);
  conferir(
    await page.locator('.leaflet-overlay-pane path').count() > 0,
    'o mapa continua desenhado mesmo sem acesso a recursos externos',
  );

  await navegador.close();
  servidor.close();

  console.log('\n' + checagens.join('\n'));
  if (externosFalhados.length) {
    console.log(
      `\nrecursos externos indisponíveis neste ambiente (esperado): ${[...new Set(externosFalhados)].join(', ')}`,
    );
  }
  if (errosConsole.length) {
    console.log('\nerros de console:');
    for (const e of [...new Set(errosConsole)]) console.log('  - ' + e);
  }
  console.log(`\nscreenshots em ${path.relative(raiz, saida)}/`);

  if (problemas.length) {
    console.error(`\n${problemas.length} verificação(ões) falharam.`);
    process.exit(1);
  }
  console.log('\ntodas as verificações passaram.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
