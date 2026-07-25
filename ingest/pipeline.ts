import { createHash } from 'node:crypto';
import type {
  AnuncioBruto,
  Dataset,
  Finalidade,
  Imovel,
  StatusFonte,
  TipoImovel,
} from '../core/types';
import { criarIndiceGeo, posicionar, resolverBairro, type IndiceGeo } from '../core/geocode';
import {
  calcularPrecoM2,
  completarPorTexto,
  detectCaracteristicas,
  parseArea,
} from '../core/normalize';
import { deduplicar } from '../core/dedupe';
import { pareceAnuncioDeIlhabela, textoVisivel } from './extratores';
import type { Adapter, ContextoColeta } from './tipos';

/** Id estável a partir da URL: o mesmo anúncio mantém o mesmo id entre coletas. */
function idDoAnuncio(bruto: AnuncioBruto): string {
  const semente = bruto.url || `${bruto.fonte}:${bruto.titulo}`;
  return createHash('sha1').update(semente).digest('hex').slice(0, 12);
}

/**
 * Converte o anúncio cru em um imóvel do dataset. Devolve `null` quando falta o mínimo para
 * o registro servir para alguma coisa — sem preço ou sem bairro ele não entra em mapa nenhum,
 * e entulhar a base com registros vazios só estragaria as medianas.
 */
export function normalizarAnuncio(
  bruto: AnuncioBruto,
  ix: IndiceGeo,
  hoje: string,
): { imovel: Imovel } | { descarte: string } {
  const completo = completarPorTexto(bruto);
  const preco = completo.preco ?? null;
  if (!preco || preco <= 0) return { descarte: 'sem preço' };

  // Antes de olhar o bairro: "Centro" existe em Caraguatatuba, em São Sebastião e em
  // Ilhabela. Sem esta checagem, um anúncio do continente vira imóvel da Vila e entra na
  // mediana do bairro. A checagem também roda nos adapters; aqui ela protege qualquer
  // entrada — inclusive um anúncio colado à mão.
  if (!pareceAnuncioDeIlhabela(completo)) return { descarte: 'município vizinho' };

  const bairro =
    resolverBairro(completo.bairroTexto, ix) ??
    resolverBairro(completo.titulo, ix) ??
    resolverBairro(completo.descricao, ix) ??
    resolverBairro(completo.url, ix);
  if (!bairro) return { descarte: 'bairro não reconhecido' };

  const finalidade: Finalidade = completo.finalidade ?? 'venda';
  const tipo: TipoImovel = completo.tipo ?? 'outro';
  let areaUtil = parseArea(completo.areaUtilTexto);
  let areaTerreno = parseArea(completo.areaTerrenoTexto);

  // A vitrine costuma mostrar uma metragem só, sem dizer qual é. Num terreno ela é sempre o
  // lote; numa casa, mais de mil metros de área construída praticamente não existe — é o
  // terreno mal rotulado. Tomada como construção, essa metragem faz o imóvel aparecer como
  // "90% abaixo da mediana do bairro", que foi o que se viu na primeira coleta.
  const AREA_CONSTRUIDA_IMPLAUSIVEL = 1_000;
  if (areaUtil !== null && areaTerreno === null) {
    const ehLote = tipo === 'terreno';
    const grandeDemaisParaConstrucao =
      areaUtil > AREA_CONSTRUIDA_IMPLAUSIVEL && (tipo === 'casa' || tipo === 'apartamento');
    if (ehLote || grandeDemaisParaConstrucao) {
      areaTerreno = areaUtil;
      areaUtil = null;
    }
  }

  // No terreno, o preço por m² é o do chão; nos demais, o da construção.
  const areaParaPrecoM2 = tipo === 'terreno' ? areaTerreno : areaUtil;

  // Aluguel anunciado com preço de venda (e vice-versa) contamina a mediana do bairro
  // inteiro; é melhor descartar do que publicar um número absurdo.
  if (finalidade === 'venda' && preco < 30_000) return { descarte: 'preço baixo demais para venda' };
  if (finalidade === 'aluguel' && preco > 200_000) return { descarte: 'preço alto demais para aluguel' };
  if (finalidade === 'temporada' && preco > 100_000) return { descarte: 'preço alto demais para diária' };

  const id = idDoAnuncio(completo);
  const pos = posicionar(id, bairro, ix, { lat: completo.lat, lon: completo.lon });
  const texto = `${completo.titulo} ${completo.descricao ?? ''}`;

  return {
    imovel: {
      id,
      titulo: completo.titulo.trim().slice(0, 160),
      finalidade,
      tipo,
      bairroId: pos.bairroId,
      bairro: pos.bairro,
      setor: pos.setor,
      preco,
      precoM2: calcularPrecoM2(preco, areaParaPrecoM2),
      condominio: null,
      iptu: null,
      areaUtil,
      areaTerreno,
      quartos: completo.quartos ?? null,
      suites: completo.suites ?? null,
      banheiros: completo.banheiros ?? null,
      vagas: completo.vagas ?? null,
      caracteristicas: detectCaracteristicas(texto),
      descricao: (completo.descricao ?? '').trim().slice(0, 2000),
      fotos: (completo.fotos ?? []).slice(0, 6),
      lat: pos.lat,
      lon: pos.lon,
      precisaoGeo: pos.precisao,
      fontes: [
        {
          fonte: completo.fonte,
          nomeFonte: completo.nomeFonte,
          url: completo.url,
          codigo: completo.codigo,
          preco,
          coletadoEm: hoje,
        },
      ],
      atualizadoEm: hoje,
    },
  };
}

/**
 * Compara com a coleta anterior para marcar o que baixou de preço e o que é novidade — que
 * é a informação que ninguém consegue extrair olhando os sites um a um.
 */
export function aplicarHistorico(imoveis: Imovel[], anterior: Imovel[] | null, hoje: string): Imovel[] {
  if (!anterior?.length) return imoveis.map((i) => ({ ...i, novo: false, variacaoPreco: null }));

  const antes = new Map(anterior.map((i) => [i.id, i]));
  return imoveis.map((imovel) => {
    const velho = antes.get(imovel.id);
    if (!velho) return { ...imovel, novo: true, variacaoPreco: null };

    const mudou = velho.preco > 0 && velho.preco !== imovel.preco;
    return {
      ...imovel,
      novo: false,
      // Mantém a data de referência da mudança anterior enquanto o preço não mudar de novo.
      variacaoPreco: mudou
        ? { pct: Math.round(((imovel.preco - velho.preco) / velho.preco) * 100) / 100, desde: velho.atualizadoEm }
        : (velho.variacaoPreco ?? null),
      atualizadoEm: mudou ? hoje : velho.atualizadoEm,
    };
  });
}

export interface ResultadoColeta {
  dataset: Dataset;
  descartes: Record<string, number>;
  /** Alguns títulos de cada motivo, para o log dizer o que precisa de ajuste. */
  exemplosDescartados: Record<string, string[]>;
}

const EXEMPLOS_POR_MOTIVO = 8;

/**
 * Boa parte das vitrines não escreve o bairro no card — só "Casa em Ilhabela". O bairro está
 * na ficha do imóvel. Sem esta passagem, um terço da coleta seria descartado por falta de
 * localização; com ela, o coletor abre a ficha de quem ficou sem bairro e lê de lá.
 *
 * O custo é uma requisição por anúncio órfão, então há um teto por execução.
 */
export async function enriquecerBairros(
  brutos: AnuncioBruto[],
  ctx: ContextoColeta,
  ix: IndiceGeo,
  teto: number,
): Promise<{ resolvidos: number; tentativas: number }> {
  let tentativas = 0;
  let resolvidos = 0;

  for (const bruto of brutos) {
    if (tentativas >= teto) break;
    const jaTem =
      resolverBairro(bruto.bairroTexto, ix) ??
      resolverBairro(bruto.titulo, ix) ??
      resolverBairro(bruto.descricao, ix) ??
      resolverBairro(bruto.url, ix);
    if (jaTem) continue;
    if (!bruto.url || !/^https?:/.test(bruto.url)) continue;

    tentativas++;
    try {
      const html = await ctx.buscarHtml(bruto.url);
      const texto = textoVisivel(html);
      if (resolverBairro(texto, ix)) {
        bruto.bairroTexto = `${bruto.bairroTexto ?? ''} ${texto}`.slice(0, 4000);
        resolvidos++;
      }
    } catch {
      // Ficha fora do ar não invalida o anúncio; ele segue para o descarte normal.
    }
  }

  if (tentativas) {
    ctx.registrar(
      `fichas abertas para achar o bairro: ${tentativas}, resolvidos ${resolvidos}`,
    );
  }
  return { resolvidos, tentativas };
}

export async function coletar(
  adapters: Adapter[],
  ctx: ContextoColeta,
  ix: IndiceGeo,
  anterior: Imovel[] | null,
  tetoFichas = 150,
): Promise<ResultadoColeta> {
  const hoje = new Date().toISOString().slice(0, 10);
  const status: StatusFonte[] = [];
  const brutos: AnuncioBruto[] = [];

  for (const adapter of adapters) {
    const inicio = Date.now();
    try {
      const anuncios = await adapter.coletar(ctx);
      brutos.push(...anuncios);
      status.push({
        fonte: adapter.id,
        nome: adapter.nome,
        status: anuncios.length ? 'ok' : 'vazio',
        quantidade: anuncios.length,
        duracaoMs: Date.now() - inicio,
        mensagem: anuncios.length ? undefined : 'nenhum anúncio encontrado nesta execução',
      });
    } catch (e) {
      // Uma fonte fora do ar não pode levar as outras junto.
      status.push({
        fonte: adapter.id,
        nome: adapter.nome,
        status: 'falha',
        quantidade: 0,
        duracaoMs: Date.now() - inicio,
        mensagem: (e as Error).message.slice(0, 200),
      });
    }
  }

  if (tetoFichas > 0) await enriquecerBairros(brutos, ctx, ix, tetoFichas);

  const descartes: Record<string, number> = {};
  const exemplosDescartados: Record<string, string[]> = {};
  const imoveis: Imovel[] = [];
  for (const bruto of brutos) {
    const resultado = normalizarAnuncio(bruto, ix, hoje);
    if ('descarte' in resultado) {
      const motivo = resultado.descarte;
      descartes[motivo] = (descartes[motivo] ?? 0) + 1;
      const exemplos = (exemplosDescartados[motivo] ??= []);
      if (exemplos.length < EXEMPLOS_POR_MOTIVO) {
        exemplos.push(`${bruto.fonte}: ${bruto.titulo.replace(/\s+/g, ' ').slice(0, 90)}`);
      }
      continue;
    }
    imoveis.push(resultado.imovel);
  }

  const unicos = aplicarHistorico(deduplicar(imoveis), anterior, hoje);

  return {
    dataset: {
      _leiame:
        'Dataset agregado dos anúncios de Ilhabela. Gerado pelo coletor (ingest/) — não editar à mão.',
      geradoEm: hoje,
      demo: false,
      imoveis: unicos,
      relatorio: {
        executadoEm: new Date().toISOString(),
        fontes: status,
        totalBruto: brutos.length,
        totalAposDedupe: unicos.length,
      },
    },
    descartes,
    exemplosDescartados,
  };
}

export { criarIndiceGeo };
