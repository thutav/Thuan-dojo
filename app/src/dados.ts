import { criarIndiceGeo, type IndiceGeo } from '@core/geocode';
import { pontoNaZona } from '@core/geometry';
import { dealScore, estatisticasPorZona, type EstatisticaZona } from '@core/stats';
import { normalizar } from '@core/texto';
import type {
  Caracteristica,
  Dataset,
  Finalidade,
  Gazetteer,
  Imovel,
  OutlineFile,
  Setor,
  TipoImovel,
  Zona,
  ZonesFile,
} from '@core/types';

export interface BaseApp {
  dataset: Dataset;
  zonas: Zona[];
  outline: OutlineFile;
  gazetteer: Gazetteer;
  indiceGeo: IndiceGeo;
  /** true quando o que está na tela ainda é a semente sintética. */
  demo: boolean;
}

const CHAVE_LOCAIS = 'ilhabela.imoveis.locais.v1';

async function buscarJson<T>(caminho: string): Promise<T | null> {
  try {
    const res = await fetch(caminho, { cache: 'no-cache' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * O dataset real (gravado pelo coletor) tem prioridade; a semente de demonstração só entra
 * enquanto ele não existir ou estiver vazio. Anúncios que a pessoa colou no próprio
 * navegador são somados aos dois casos.
 */
export async function carregarBase(): Promise<BaseApp> {
  const [real, demo, zonesFile, outline, gazetteer] = await Promise.all([
    buscarJson<Dataset>('./data/listings.json'),
    buscarJson<Dataset>('./data/listings.demo.json'),
    buscarJson<ZonesFile>('./data/zones.json'),
    buscarJson<OutlineFile>('./data/ilhabela.outline.json'),
    buscarJson<Gazetteer>('./data/gazetteer.json'),
  ]);

  if (!zonesFile || !outline || !gazetteer) {
    throw new Error('Base geográfica não encontrada. Rode `npm run build:geo`.');
  }

  const temReal = !!real && real.imoveis.length > 0 && !real.demo;
  const escolhido: Dataset = temReal
    ? real
    : (demo ?? { geradoEm: new Date().toISOString().slice(0, 10), demo: true, imoveis: [], relatorio: null });

  const locais = carregarLocais();
  const dataset: Dataset = {
    ...escolhido,
    imoveis: [...escolhido.imoveis, ...locais],
  };

  return {
    dataset,
    zonas: zonesFile.zonas,
    outline,
    gazetteer,
    indiceGeo: criarIndiceGeo(gazetteer, zonesFile.zonas),
    demo: !temReal,
  };
}

export function carregarLocais(): Imovel[] {
  try {
    const cru = localStorage.getItem(CHAVE_LOCAIS);
    if (!cru) return [];
    const lista = JSON.parse(cru) as Imovel[];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

export function salvarLocais(imoveis: Imovel[]): void {
  localStorage.setItem(CHAVE_LOCAIS, JSON.stringify(imoveis));
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

export type Ordenacao =
  | 'oportunidade'
  | 'preco-asc'
  | 'preco-desc'
  | 'm2-asc'
  | 'area-desc'
  | 'recentes';

export interface Filtros {
  finalidade: Finalidade;
  texto: string;
  tipos: TipoImovel[];
  precoMin: number | null;
  precoMax: number | null;
  areaMin: number | null;
  areaMax: number | null;
  quartosMin: number | null;
  suitesMin: number | null;
  vagasMin: number | null;
  caracteristicas: Caracteristica[];
  setores: Setor[];
  bairros: string[];
  somenteFavoritos: boolean;
  somenteComFoto: boolean;
  ordenacao: Ordenacao;
  /** Área desenhada à mão sobre o mapa, em [lat, lon]. */
  poligono: [number, number][] | null;
}

export const FILTROS_PADRAO: Filtros = {
  finalidade: 'venda',
  texto: '',
  tipos: [],
  precoMin: null,
  precoMax: null,
  areaMin: null,
  areaMax: null,
  quartosMin: null,
  suitesMin: null,
  vagasMin: null,
  caracteristicas: [],
  setores: [],
  bairros: [],
  somenteFavoritos: false,
  somenteComFoto: false,
  ordenacao: 'oportunidade',
  poligono: null,
};

export function contarFiltrosAtivos(f: Filtros): number {
  let n = 0;
  if (f.texto.trim()) n++;
  if (f.tipos.length) n++;
  if (f.precoMin !== null || f.precoMax !== null) n++;
  if (f.areaMin !== null || f.areaMax !== null) n++;
  if (f.quartosMin !== null) n++;
  if (f.suitesMin !== null) n++;
  if (f.vagasMin !== null) n++;
  if (f.caracteristicas.length) n++;
  if (f.setores.length) n++;
  if (f.bairros.length) n++;
  if (f.somenteFavoritos) n++;
  if (f.somenteComFoto) n++;
  if (f.poligono) n++;
  return n;
}

function combinaTexto(i: Imovel, alvo: string): boolean {
  if (!alvo) return true;
  const campo = normalizar(`${i.titulo} ${i.bairro} ${i.descricao} ${i.tipo}`);
  return alvo
    .split(/\s+/)
    .filter(Boolean)
    .every((termo) => campo.includes(termo));
}

export function aplicarFiltros(imoveis: Imovel[], f: Filtros, favoritos: Set<string>): Imovel[] {
  const alvo = normalizar(f.texto.trim());
  return imoveis.filter((i) => {
    if (i.finalidade !== f.finalidade) return false;
    if (f.tipos.length && !f.tipos.includes(i.tipo)) return false;
    if (f.precoMin !== null && i.preco < f.precoMin) return false;
    if (f.precoMax !== null && i.preco > f.precoMax) return false;

    const area = i.areaUtil ?? i.areaTerreno;
    if (f.areaMin !== null && (area === null || area < f.areaMin)) return false;
    if (f.areaMax !== null && (area === null || area > f.areaMax)) return false;

    if (f.quartosMin !== null && (i.quartos ?? 0) < f.quartosMin) return false;
    if (f.suitesMin !== null && (i.suites ?? 0) < f.suitesMin) return false;
    if (f.vagasMin !== null && (i.vagas ?? 0) < f.vagasMin) return false;

    if (f.caracteristicas.length && !f.caracteristicas.every((c) => i.caracteristicas.includes(c))) {
      return false;
    }
    if (f.setores.length && !f.setores.includes(i.setor)) return false;
    if (f.bairros.length && !f.bairros.includes(i.bairroId)) return false;
    if (f.somenteFavoritos && !favoritos.has(i.id)) return false;
    if (f.somenteComFoto && i.fotos.length === 0) return false;
    if (f.poligono && !pontoNaZona(i.lat, i.lon, f.poligono)) return false;
    return combinaTexto(i, alvo);
  });
}

export function ordenar(
  imoveis: Imovel[],
  ordenacao: Ordenacao,
  estatisticas: Map<string, EstatisticaZona>,
): Imovel[] {
  const lista = [...imoveis];
  switch (ordenacao) {
    case 'preco-asc':
      return lista.sort((a, b) => a.preco - b.preco);
    case 'preco-desc':
      return lista.sort((a, b) => b.preco - a.preco);
    case 'm2-asc':
      return lista.sort((a, b) => (a.precoM2 ?? Infinity) - (b.precoM2 ?? Infinity));
    case 'area-desc':
      return lista.sort(
        (a, b) => (b.areaUtil ?? b.areaTerreno ?? 0) - (a.areaUtil ?? a.areaTerreno ?? 0),
      );
    case 'recentes':
      return lista.sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
    case 'oportunidade':
    default:
      // Quem tem desconto medido contra o bairro vem primeiro; sem medição, ordena por data.
      return lista.sort((a, b) => {
        const da = dealScore(a, estatisticas)?.pct;
        const db = dealScore(b, estatisticas)?.pct;
        if (da === undefined && db === undefined) return b.atualizadoEm.localeCompare(a.atualizadoEm);
        if (da === undefined) return 1;
        if (db === undefined) return -1;
        return da - db;
      });
  }
}

export function calcularEstatisticas(
  imoveis: Imovel[],
  finalidade: Finalidade,
): Map<string, EstatisticaZona> {
  return estatisticasPorZona(imoveis, { finalidade });
}

/** Faixa de preço presente nos dados — alimenta os limites dos controles de filtro. */
export function faixaDePreco(imoveis: Imovel[], finalidade: Finalidade): [number, number] {
  const precos = imoveis.filter((i) => i.finalidade === finalidade).map((i) => i.preco);
  if (!precos.length) return [0, 0];
  return [Math.min(...precos), Math.max(...precos)];
}
