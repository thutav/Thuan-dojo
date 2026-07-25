/**
 * Avalia os alertas de data/alertas.json contra a coleta mais recente e escreve um relatório
 * em Markdown com o que entrou novo ou baixou de preço dentro de cada busca.
 *
 * Quem entrega o aviso é o GitHub: o workflow abre uma issue com este conteúdo, e o GitHub
 * manda o e-mail para quem acompanha o repositório. Sem servidor de e-mail, sem senha
 * guardada, sem serviço externo.
 *
 *   npm run alertas             usa data/listings.json
 *   npm run alertas -- --tudo   ignora "é novidade" e lista tudo que casa com os filtros
 *
 * Os favoritos ficam no navegador de quem usa o aplicativo, então o alerta não os enxerga —
 * o que ele acompanha são as buscas descritas no arquivo.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dealScore, estatisticasPorZona, type EstatisticaZona } from '../core/stats';
import { formatarPreco, formatarPrecoM2 } from '../core/format';
import type { Caracteristica, Dataset, Finalidade, Imovel, Setor, TipoImovel } from '../core/types';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const dataDir = path.join(raiz, 'data');
const TUDO = process.argv.includes('--tudo');

interface Alerta {
  nome: string;
  ativo?: boolean;
  finalidade: Finalidade;
  precoMin?: number;
  precoMax?: number;
  areaMin?: number;
  quartosMin?: number;
  suitesMin?: number;
  vagasMin?: number;
  tipos?: TipoImovel[];
  setores?: Setor[];
  bairros?: string[];
  caracteristicas?: Caracteristica[];
  /** 0.15 = só avisa quando estiver ao menos 15% abaixo da mediana do bairro. */
  descontoMinimo?: number;
}

function casaComFiltro(i: Imovel, a: Alerta): boolean {
  if (i.finalidade !== a.finalidade) return false;
  if (a.precoMin !== undefined && i.preco < a.precoMin) return false;
  if (a.precoMax !== undefined && i.preco > a.precoMax) return false;
  const area = i.areaUtil ?? i.areaTerreno;
  if (a.areaMin !== undefined && (area === null || area < a.areaMin)) return false;
  if (a.quartosMin !== undefined && (i.quartos ?? 0) < a.quartosMin) return false;
  if (a.suitesMin !== undefined && (i.suites ?? 0) < a.suitesMin) return false;
  if (a.vagasMin !== undefined && (i.vagas ?? 0) < a.vagasMin) return false;
  if (a.tipos?.length && !a.tipos.includes(i.tipo)) return false;
  if (a.setores?.length && !a.setores.includes(i.setor)) return false;
  if (a.bairros?.length && !a.bairros.includes(i.bairroId)) return false;
  if (a.caracteristicas?.length && !a.caracteristicas.every((c) => i.caracteristicas.includes(c))) {
    return false;
  }
  return true;
}

/** O alerta só dispara pelo que mudou desde a última coleta — senão avisaria o mesmo todo dia. */
function ehNovidade(i: Imovel): 'novo' | 'baixou' | null {
  if (i.novo) return 'novo';
  if (i.variacaoPreco && i.variacaoPreco.pct <= -0.03) return 'baixou';
  return null;
}

export function avaliarAlertas(
  dataset: Dataset,
  alertas: Alerta[],
): { alerta: Alerta; achados: { imovel: Imovel; motivo: string; score: string | null }[] }[] {
  const porFinalidade = new Map<Finalidade, Map<string, EstatisticaZona>>();
  const estatisticas = (f: Finalidade) => {
    let e = porFinalidade.get(f);
    if (!e) {
      e = estatisticasPorZona(dataset.imoveis, { finalidade: f });
      porFinalidade.set(f, e);
    }
    return e;
  };

  return alertas
    .filter((a) => a.ativo !== false)
    .map((alerta) => {
      const est = estatisticas(alerta.finalidade);
      const achados = dataset.imoveis
        .filter((i) => casaComFiltro(i, alerta))
        .map((imovel) => ({ imovel, score: dealScore(imovel, est) }))
        .filter(({ imovel, score }) => {
          if (alerta.descontoMinimo !== undefined) {
            if (!score || score.pct > -alerta.descontoMinimo) return false;
          }
          return TUDO || ehNovidade(imovel) !== null;
        })
        .map(({ imovel, score }) => ({
          imovel,
          motivo:
            ehNovidade(imovel) === 'baixou'
              ? `baixou ${Math.abs(Math.round((imovel.variacaoPreco?.pct ?? 0) * 100))}%`
              : ehNovidade(imovel) === 'novo'
                ? 'novo na base'
                : 'já estava na base',
          score: score?.rotulo ?? null,
        }))
        .sort((a, b) => a.imovel.preco - b.imovel.preco);
      return { alerta, achados };
    })
    .filter((r) => r.achados.length > 0);
}

export function montarRelatorio(
  resultados: ReturnType<typeof avaliarAlertas>,
  geradoEm: string,
): string {
  const linhas: string[] = [];
  const total = resultados.reduce((s, r) => s + r.achados.length, 0);

  linhas.push(`Coleta de ${geradoEm} — ${total} ${total === 1 ? 'imóvel' : 'imóveis'} nas suas buscas.`);
  linhas.push('');

  for (const { alerta, achados } of resultados) {
    linhas.push(`## ${alerta.nome}`);
    linhas.push('');
    linhas.push('| Imóvel | Bairro | Preço | Por m² | Contra o bairro | Por quê |');
    linhas.push('| --- | --- | --- | --- | --- | --- |');
    for (const { imovel, motivo, score } of achados.slice(0, 25)) {
      const link = imovel.fontes[0]?.url;
      const titulo = link ? `[${imovel.titulo}](${link})` : imovel.titulo;
      linhas.push(
        `| ${titulo} | ${imovel.bairro} | ${formatarPreco(imovel.preco, imovel.finalidade)} | ${formatarPrecoM2(imovel.precoM2, imovel.finalidade)} | ${score ?? '—'} | ${motivo} |`,
      );
    }
    if (achados.length > 25) linhas.push(`| … e mais ${achados.length - 25} | | | | | |`);
    linhas.push('');
    for (const { imovel } of achados.slice(0, 25)) {
      if (imovel.fontes.length > 1) {
        linhas.push(
          `- **${imovel.titulo}** está em ${imovel.fontes.length} corretoras: ${imovel.fontes
            .map((f) => `${f.nomeFonte} (${formatarPreco(f.preco, imovel.finalidade)})`)
            .join(', ')}`,
        );
      }
    }
    linhas.push('');
  }

  linhas.push('---');
  linhas.push(
    'Aberto pela coleta automática. Para mudar o que é acompanhado, edite `data/alertas.json`.',
  );
  return linhas.join('\n');
}

function main() {
  const caminho = path.join(dataDir, 'listings.json');
  if (!existsSync(caminho)) {
    console.log('Ainda não há coleta real. Nada a avaliar.');
    return;
  }

  const dataset = JSON.parse(readFileSync(caminho, 'utf8')) as Dataset;
  const config = JSON.parse(readFileSync(path.join(dataDir, 'alertas.json'), 'utf8')) as {
    alertas: Alerta[];
  };

  const resultados = avaliarAlertas(dataset, config.alertas);
  const saida = path.join(raiz, 'alerta.md');

  if (!resultados.length) {
    writeFileSync(saida, '');
    console.log('Nenhuma novidade nas buscas acompanhadas.');
    return;
  }

  const relatorio = montarRelatorio(resultados, dataset.geradoEm);
  writeFileSync(saida, relatorio);
  console.log(relatorio);
}

// Só executa quando chamado direto: os testes importam as funções acima.
if (process.argv[1] && process.argv[1].endsWith('alertas.ts')) main();
