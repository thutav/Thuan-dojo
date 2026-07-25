/**
 * Coletor de anúncios de Ilhabela.
 *
 *   npm run ingest                      coleta tudo e grava data/listings.json
 *   npm run ingest -- --somente=sergiohette,capitallitoral
 *   npm run ingest -- --sem-navegador   pula os portais que exigem Chromium
 *   npm run ingest -- --fixtures        roda o pipeline sobre ingest/fixtures, sem rede
 *   npm run ingest -- --seco            coleta de verdade mas não grava nada
 *
 * Este script precisa de internet, então não roda no ambiente de desenvolvimento do agente
 * (que só alcança npm e o GitHub). Ele roda na sua máquina e no GitHub Actions.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Dataset, Gazetteer, ZonesFile } from '../core/types';
import { criarIndiceGeo } from '../core/geocode';
import { adaptersImobiliarias } from './adapters/imobiliarias';
import { adaptersPortais } from './adapters/portais';
import { coletar } from './pipeline';
import type { Adapter, ContextoColeta } from './tipos';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const dataDir = path.join(raiz, 'data');

const argumentos = process.argv.slice(2);
const temFlag = (nome: string) => argumentos.includes(`--${nome}`);
const valorFlag = (nome: string) =>
  argumentos.find((a) => a.startsWith(`--${nome}=`))?.split('=')[1] ?? null;

const USAR_FIXTURES = temFlag('fixtures');
const SEM_NAVEGADOR = temFlag('sem-navegador') || USAR_FIXTURES;
const SECO = temFlag('seco') || USAR_FIXTURES;
const SOMENTE = valorFlag('somente')?.split(',').filter(Boolean) ?? null;
const MAX_PAGINAS = Number(valorFlag('max-paginas') ?? 8);
const INTERVALO_MS = Number(valorFlag('intervalo') ?? 1500);

const CABECALHOS = {
  'User-Agent':
    'Mozilla/5.0 (compatible; IlhabelaImoveisBot/1.0; agregador local de anúncios; +https://github.com/thutav/Thuan-dojo)',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  Accept: 'text/html,application/xhtml+xml',
};

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function criarContexto(registrar: (m: string) => void): ContextoColeta {
  let ultimaRequisicao = 0;
  let navegador: import('playwright').Browser | null = null;

  return {
    maxPaginas: MAX_PAGINAS,
    registrar,

    async buscarHtml(url: string) {
      if (USAR_FIXTURES) {
        // Sem rede: o pipeline inteiro roda sobre as páginas de exemplo do repositório.
        const arquivo = path.join(raiz, 'ingest', 'fixtures', 'vitrine-html.html');
        return readFileSync(arquivo, 'utf8');
      }
      const espera = INTERVALO_MS - (Date.now() - ultimaRequisicao);
      if (espera > 0) await esperar(espera);
      ultimaRequisicao = Date.now();

      // Uma vitrine que não responde em 12s provavelmente não existe mais. Esperar 25s por
      // cada palpite de URL fazia a coleta inteira levar mais de vinte minutos.
      const controle = AbortSignal.timeout(12_000);
      const res = await fetch(url, { headers: CABECALHOS, signal: controle, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },

    async buscarComNavegador(url: string, esperarPor?: string) {
      if (SEM_NAVEGADOR) throw new Error('modo sem navegador');
      if (!navegador) {
        const { chromium } = await import('playwright');
        const binario = process.env.CHROMIUM_PATH;
        navegador = await chromium.launch(binario ? { executablePath: binario } : {});
      }
      const contexto = await navegador.newContext({
        locale: 'pt-BR',
        viewport: { width: 1440, height: 900 },
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      });
      const pagina = await contexto.newPage();
      try {
        await pagina.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        if (esperarPor) {
          await pagina.waitForSelector(esperarPor, { timeout: 12_000 }).catch(() => {
            registrar(`aviso: seletor "${esperarPor}" não apareceu em ${url}`);
          });
        }
        await pagina.waitForTimeout(1200);
        return await pagina.content();
      } finally {
        await contexto.close();
      }
    },
  };
}

async function main() {
  const gaz = JSON.parse(readFileSync(path.join(dataDir, 'gazetteer.json'), 'utf8')) as Gazetteer;
  const zonas = JSON.parse(readFileSync(path.join(dataDir, 'zones.json'), 'utf8')) as ZonesFile;
  const ix = criarIndiceGeo(gaz, zonas.zonas);

  const caminhoDataset = path.join(dataDir, 'listings.json');
  const anterior: Dataset | null = existsSync(caminhoDataset)
    ? (JSON.parse(readFileSync(caminhoDataset, 'utf8')) as Dataset)
    : null;

  let adapters: Adapter[] = [...adaptersImobiliarias, ...adaptersPortais];
  if (SEM_NAVEGADOR) adapters = adapters.filter((a) => a.modo !== 'navegador');
  if (SOMENTE) adapters = adapters.filter((a) => SOMENTE.includes(a.id));
  if (!adapters.length) {
    console.error('Nenhum adapter selecionado.');
    process.exit(1);
  }

  const registros: string[] = [];
  const ctx = criarContexto((m) => {
    registros.push(m);
    console.log('  ' + m);
  });

  console.log(`coletando de ${adapters.length} fontes${USAR_FIXTURES ? ' (modo fixtures)' : ''}…`);
  const { dataset, descartes } = await coletar(adapters, ctx, ix, anterior?.imoveis ?? null);

  console.log('\nresumo por fonte:');
  for (const f of dataset.relatorio!.fontes) {
    console.log(
      `  ${f.status.padEnd(6)} ${f.nome.padEnd(28)} ${String(f.quantidade).padStart(4)} anúncios  ${(f.duracaoMs / 1000).toFixed(1)}s${f.mensagem ? '  — ' + f.mensagem : ''}`,
    );
  }

  if (Object.keys(descartes).length) {
    console.log('\ndescartados:');
    for (const [motivo, n] of Object.entries(descartes)) console.log(`  ${String(n).padStart(4)} ${motivo}`);
  }

  console.log(
    `\n${dataset.relatorio!.totalBruto} anúncios coletados → ${dataset.imoveis.length} imóveis distintos`,
  );
  const comVariacao = dataset.imoveis.filter((i) => i.variacaoPreco).length;
  const novos = dataset.imoveis.filter((i) => i.novo).length;
  if (anterior) console.log(`${novos} novos, ${comVariacao} com mudança de preço desde a última coleta`);

  if (SECO) {
    console.log('\nmodo seco: nada foi gravado.');
    return;
  }

  if (!dataset.imoveis.length) {
    // Gravar um dataset vazio apagaria a coleta boa da véspera por causa de uma queda de rede.
    console.error('\nnenhum imóvel coletado — o dataset anterior foi preservado.');
    process.exit(1);
  }

  writeFileSync(caminhoDataset, JSON.stringify(dataset));
  const historico = path.join(dataDir, 'history');
  mkdirSync(historico, { recursive: true });
  writeFileSync(
    path.join(historico, `${dataset.geradoEm}.json`),
    JSON.stringify({
      data: dataset.geradoEm,
      total: dataset.imoveis.length,
      precos: dataset.imoveis.map((i) => ({ id: i.id, preco: i.preco, bairroId: i.bairroId })),
    }),
  );
  console.log(`\ngravado em data/listings.json e no histórico de ${dataset.geradoEm}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
