import type { Imovel } from './types';
import { calcularPrecoM2 } from './normalize';
import { similaridade } from './texto';

/**
 * O mesmo imóvel costuma aparecer em três ou quatro vitrines com preços diferentes. Agregar
 * sem juntar essas repetições produziria um mapa mentiroso: dez anúncios do mesmo bairro
 * poderiam ser o mesmo casarão contado dez vezes, inflando a mediana.
 *
 * Critério: mesma finalidade, tipo, bairro e nº de quartos; área compatível (±3%); e preço
 * próximo (≤5%) ou títulos parecidos. Preços muito distantes entre fontes do mesmo imóvel
 * viram um aviso na ficha em vez de sumirem na média.
 */
const TOLERANCIA_AREA = 0.03;
const TOLERANCIA_PRECO_PARA_UNIR = 0.05;
const SIMILARIDADE_TITULO = 0.5;
export const DIVERGENCIA_RELEVANTE = 0.15;

function chaveBucket(i: Imovel): string {
  return `${i.finalidade}|${i.tipo}|${i.bairroId}|${i.quartos ?? '?'}`;
}

function proximo(a: number | null, b: number | null, tolerancia: number): boolean {
  if (a === null || b === null) return true; // informação ausente não desempata
  if (a <= 0 || b <= 0) return true;
  return Math.abs(a - b) / Math.max(a, b) <= tolerancia;
}

function ehMesmoImovel(a: Imovel, b: Imovel): boolean {
  if (a.fontes[0]?.fonte === b.fontes[0]?.fonte && a.fontes[0]?.url === b.fontes[0]?.url) return true;
  if (!proximo(a.areaUtil, b.areaUtil, TOLERANCIA_AREA)) return false;
  if (a.areaUtil === null && b.areaUtil === null && !proximo(a.areaTerreno, b.areaTerreno, TOLERANCIA_AREA)) {
    return false;
  }
  const precoProximo = proximo(a.preco, b.preco, TOLERANCIA_PRECO_PARA_UNIR);
  const tituloParecido = similaridade(a.titulo, b.titulo) >= SIMILARIDADE_TITULO;
  return precoProximo || tituloParecido;
}

/** Une-e-busca simples: agrupa transitivamente os anúncios equivalentes. */
export function deduplicar(imoveis: Imovel[]): Imovel[] {
  const buckets = new Map<string, Imovel[]>();
  for (const i of imoveis) {
    const k = chaveBucket(i);
    const lista = buckets.get(k);
    if (lista) lista.push(i);
    else buckets.set(k, [i]);
  }

  const resultado: Imovel[] = [];
  for (const lista of buckets.values()) {
    const pai = lista.map((_, i) => i);
    const raiz = (x: number): number => (pai[x] === x ? x : (pai[x] = raiz(pai[x])));
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        if (raiz(i) !== raiz(j) && ehMesmoImovel(lista[i], lista[j])) pai[raiz(i)] = raiz(j);
      }
    }
    const grupos = new Map<number, Imovel[]>();
    lista.forEach((im, i) => {
      const r = raiz(i);
      const g = grupos.get(r);
      if (g) g.push(im);
      else grupos.set(r, [im]);
    });
    for (const grupo of grupos.values()) resultado.push(fundir(grupo));
  }
  return resultado;
}

/** Funde um grupo em um único imóvel: menor preço, campos mais completos, todas as fontes. */
export function fundir(grupo: Imovel[]): Imovel {
  if (grupo.length === 1) return grupo[0];

  // O anúncio com mais informação preenchida vira a base da ficha.
  const completude = (i: Imovel) =>
    [i.areaUtil, i.areaTerreno, i.quartos, i.suites, i.banheiros, i.vagas].filter(
      (v) => v !== null,
    ).length +
    i.fotos.length * 0.1 +
    i.descricao.length / 1000;
  const base = [...grupo].sort((a, b) => completude(b) - completude(a))[0];

  const fontes = grupo
    .flatMap((i) => i.fontes)
    .filter((f, i, arr) => arr.findIndex((o) => o.url === f.url) === i)
    .sort((a, b) => a.preco - b.preco);

  const precos = fontes.map((f) => f.preco).filter((p) => p > 0);
  const preco = precos.length ? Math.min(...precos) : base.preco;
  const divergencia =
    precos.length > 1 && (Math.max(...precos) - Math.min(...precos)) / Math.max(...precos) > DIVERGENCIA_RELEVANTE;

  const primeiroNaoNulo = <K extends keyof Imovel>(campo: K): Imovel[K] => {
    for (const i of grupo) if (i[campo] !== null && i[campo] !== undefined) return i[campo];
    return base[campo];
  };

  const areaUtil = primeiroNaoNulo('areaUtil') as number | null;
  const fotos = [...new Set(grupo.flatMap((i) => i.fotos))];
  const caracteristicas = [...new Set(grupo.flatMap((i) => i.caracteristicas))];

  return {
    ...base,
    preco,
    precoM2: calcularPrecoM2(preco, areaUtil),
    areaUtil,
    areaTerreno: primeiroNaoNulo('areaTerreno') as number | null,
    quartos: primeiroNaoNulo('quartos') as number | null,
    suites: primeiroNaoNulo('suites') as number | null,
    banheiros: primeiroNaoNulo('banheiros') as number | null,
    vagas: primeiroNaoNulo('vagas') as number | null,
    condominio: primeiroNaoNulo('condominio') as number | null,
    iptu: primeiroNaoNulo('iptu') as number | null,
    descricao: grupo.map((i) => i.descricao).sort((a, b) => b.length - a.length)[0] ?? '',
    fotos,
    caracteristicas,
    fontes,
    divergenciaFontes: divergencia,
  };
}
