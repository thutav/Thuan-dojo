/**
 * Aplica à base já publicada as regras de sanidade que o coletor passou a ter.
 *
 * A coleta roda de 6 em 6 horas e limparia isso sozinha na próxima execução, mas quem abrir o
 * mapa antes disso veria os registros ruins — e um preço absurdo estica a legenda do mapa
 * inteiro. Este script é uma faxina pontual, com a mesma régua do coletor.
 *
 *   npx tsx scripts/sanear-base.ts [--aplicar]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Imovel } from '../core/types';
import { normalizar } from '../core/texto';

const raiz = fileURLToPath(new URL('..', import.meta.url));

const TETO_DE_VENDA = 300_000_000;
const TITULO_DE_FAIXA =
  /^(ate|de|acima de|abaixo de|a partir de)\s+r\$\s*[\d.,]+(\s*(a|ate)\s*r\$\s*[\d.,]+)?$/;
const PARAM_DE_IDENTIFICACAO = /^(id|cod|codigo|ref|referencia|imovel|imv|item|codigo_imovel)$/i;

/** Mesma pergunta do coletor: este registro é um imóvel, ou é um pedaço da vitrine? */
function motivoDeRemocao(i: Imovel): string | null {
  if (i.finalidade === 'venda' && i.preco > TETO_DE_VENDA) return 'preço implausível para venda';
  if (TITULO_DE_FAIXA.test(normalizar(i.titulo))) return 'título é faixa de preço, não imóvel';

  for (const f of i.fontes) {
    try {
      const u = new URL(f.url);
      const chaves = [...u.searchParams.keys()];
      // Link para a própria vitrine, com filtro na query e sem identificar imóvel nenhum.
      if (
        /\/(imovel|imoveis|busca|pesquisa)\/?$/.test(u.pathname) &&
        chaves.length > 0 &&
        !chaves.some((c) => PARAM_DE_IDENTIFICACAO.test(c))
      ) {
        return 'link de filtro da vitrine';
      }
    } catch {
      /* URL colada à mão não tem o que checar aqui */
    }
  }
  return null;
}

function main() {
  const aplicar = process.argv.includes('--aplicar');
  const alvos = [
    path.join(raiz, 'data', 'listings.json'),
    path.join(raiz, 'ilhabela', 'data', 'listings.json'),
  ];

  const dados = JSON.parse(readFileSync(alvos[0], 'utf8')) as { imoveis: Imovel[] };
  const remover = new Map<string, string>();
  for (const i of dados.imoveis) {
    const motivo = motivoDeRemocao(i);
    if (motivo) remover.set(i.id, motivo);
  }

  console.log(`${dados.imoveis.length} imóveis na base, ${remover.size} a remover:`);
  for (const i of dados.imoveis) {
    const motivo = remover.get(i.id);
    if (motivo) console.log(`  - ${i.titulo.slice(0, 46).padEnd(48)} ${motivo}`);
  }

  if (!remover.size) return;
  if (!aplicar) {
    console.log('\nnada foi escrito. use --aplicar para gravar.');
    return;
  }

  for (const alvo of alvos) {
    const arquivo = JSON.parse(readFileSync(alvo, 'utf8')) as { imoveis: Imovel[] };
    arquivo.imoveis = arquivo.imoveis.filter((i) => !remover.has(i.id));
    writeFileSync(alvo, JSON.stringify(arquivo) + '\n');
    console.log(`\n${path.relative(raiz, alvo)}: ${arquivo.imoveis.length} imóveis`);
  }
}

main();
