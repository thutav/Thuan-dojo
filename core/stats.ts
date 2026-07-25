import type { Finalidade, Imovel, TipoImovel } from './types';

/**
 * Abaixo deste número de anúncios, uma mediana de bairro é ruído — e ruído apresentado como
 * "preço do metro quadrado no bairro" é pior do que não dizer nada. Zonas com amostra menor
 * aparecem hachuradas no mapa, sem número.
 */
export const AMOSTRA_MINIMA = 5;

export function mediana(valores: number[]): number | null {
  return quantil(valores, 0.5);
}

export function quantil(valores: number[], q: number): number | null {
  const v = valores.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const pos = (v.length - 1) * q;
  const base = Math.floor(pos);
  const resto = pos - base;
  return v[base + 1] !== undefined ? v[base] + resto * (v[base + 1] - v[base]) : v[base];
}

export interface EstatisticaZona {
  bairroId: string;
  n: number;
  /** Número de anúncios com área informada — base do preço por m². */
  nComArea: number;
  medianaPreco: number | null;
  medianaPrecoM2: number | null;
  q1PrecoM2: number | null;
  q3PrecoM2: number | null;
  menorPreco: number | null;
  maiorPreco: number | null;
  medianaArea: number | null;
  confiavel: boolean;
}

export interface FiltroEstatistica {
  finalidade: Finalidade;
  tipo?: TipoImovel | null;
  /** Inclui os registros de demonstração no cálculo. */
  incluirDemo?: boolean;
}

export function estatisticasPorZona(
  imoveis: Imovel[],
  filtro: FiltroEstatistica,
): Map<string, EstatisticaZona> {
  const porZona = new Map<string, Imovel[]>();
  for (const i of imoveis) {
    if (i.finalidade !== filtro.finalidade) continue;
    if (filtro.tipo && i.tipo !== filtro.tipo) continue;
    if (i.demo && filtro.incluirDemo === false) continue;
    const lista = porZona.get(i.bairroId);
    if (lista) lista.push(i);
    else porZona.set(i.bairroId, [i]);
  }

  const saida = new Map<string, EstatisticaZona>();
  for (const [bairroId, lista] of porZona) {
    const precos = lista.map((i) => i.preco).filter((p) => p > 0);
    const precosM2 = lista.map((i) => i.precoM2).filter((p): p is number => !!p && p > 0);
    const areas = lista.map((i) => i.areaUtil).filter((a): a is number => !!a && a > 0);
    saida.set(bairroId, {
      bairroId,
      n: lista.length,
      nComArea: precosM2.length,
      medianaPreco: mediana(precos),
      medianaPrecoM2: precosM2.length >= AMOSTRA_MINIMA ? mediana(precosM2) : null,
      q1PrecoM2: precosM2.length >= AMOSTRA_MINIMA ? quantil(precosM2, 0.25) : null,
      q3PrecoM2: precosM2.length >= AMOSTRA_MINIMA ? quantil(precosM2, 0.75) : null,
      menorPreco: precos.length ? Math.min(...precos) : null,
      maiorPreco: precos.length ? Math.max(...precos) : null,
      medianaArea: mediana(areas),
      confiavel: precosM2.length >= AMOSTRA_MINIMA,
    });
  }
  return saida;
}

export interface DealScore {
  /** Negativo = mais barato que a mediana do bairro. */
  pct: number;
  medianaZona: number;
  rotulo: string;
  nivel: 'oportunidade' | 'abaixo' | 'na-media' | 'acima';
}

/**
 * Compara o preço por m² do imóvel com a mediana do próprio bairro, para a mesma finalidade
 * e o mesmo tipo. Sem amostra suficiente na zona, devolve `null` em vez de um número frágil.
 */
export function dealScore(imovel: Imovel, estatisticas: Map<string, EstatisticaZona>): DealScore | null {
  if (!imovel.precoM2 || imovel.precoM2 <= 0) return null;
  const est = estatisticas.get(imovel.bairroId);
  if (!est || !est.confiavel || !est.medianaPrecoM2) return null;

  const pct = (imovel.precoM2 - est.medianaPrecoM2) / est.medianaPrecoM2;
  const nivel: DealScore['nivel'] =
    pct <= -0.2 ? 'oportunidade' : pct <= -0.07 ? 'abaixo' : pct < 0.07 ? 'na-media' : 'acima';
  const abs = Math.round(Math.abs(pct) * 100);
  const rotulo =
    nivel === 'na-media'
      ? 'na mediana do bairro'
      : `${abs}% ${pct < 0 ? 'abaixo' : 'acima'} da mediana do bairro`;
  return { pct, medianaZona: est.medianaPrecoM2, rotulo, nivel };
}

/** Escala quantílica: devolve os cortes que separam os valores em `faixas` grupos iguais. */
export function cortesQuantilicos(valores: number[], faixas: number): number[] {
  const v = valores.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length < faixas) return v.length ? [...new Set(v)] : [];
  const cortes: number[] = [];
  for (let i = 1; i < faixas; i++) {
    const q = quantil(v, i / faixas);
    if (q !== null) cortes.push(q);
  }
  return [...new Set(cortes)];
}

export function faixaDoValor(valor: number, cortes: number[]): number {
  let i = 0;
  while (i < cortes.length && valor >= cortes[i]) i++;
  return i;
}
