import { useCallback, useEffect, useState } from 'react';
import type { Caracteristica, Finalidade, Setor, TipoImovel } from '@core/types';
import { FILTROS_PADRAO, type Filtros, type Ordenacao } from './dados';

/**
 * Os filtros vivem na barra de endereços: quem achou uma busca boa manda o link para o
 * cônjuge, o corretor ou salva nos favoritos do navegador e volta nela depois.
 */
const CHAVES: Record<string, keyof Filtros> = {
  m: 'finalidade',
  q: 'texto',
  t: 'tipos',
  pmin: 'precoMin',
  pmax: 'precoMax',
  amin: 'areaMin',
  amax: 'areaMax',
  qt: 'quartosMin',
  st: 'suitesMin',
  vg: 'vagasMin',
  c: 'caracteristicas',
  s: 'setores',
  b: 'bairros',
  fav: 'somenteFavoritos',
  foto: 'somenteComFoto',
  o: 'ordenacao',
  poly: 'poligono',
};

export function filtrosParaUrl(f: Filtros): string {
  const p = new URLSearchParams();
  for (const [chave, campo] of Object.entries(CHAVES)) {
    const valor = f[campo];
    const padrao = FILTROS_PADRAO[campo];
    if (valor === null || valor === undefined) continue;
    if (Array.isArray(valor)) {
      if (!valor.length) continue;
      if (campo === 'poligono') {
        p.set(
          chave,
          (valor as [number, number][]).map(([a, b]) => `${a.toFixed(4)},${b.toFixed(4)}`).join(';'),
        );
      } else {
        p.set(chave, (valor as string[]).join(','));
      }
      continue;
    }
    if (valor === padrao) continue;
    if (typeof valor === 'boolean') {
      if (valor) p.set(chave, '1');
      continue;
    }
    if (typeof valor === 'string' && !valor.trim()) continue;
    p.set(chave, String(valor));
  }
  return p.toString();
}

function numeroOuNulo(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function filtrosDaUrl(busca: string): Filtros {
  const p = new URLSearchParams(busca);
  const f: Filtros = { ...FILTROS_PADRAO };

  const modo = p.get('m');
  if (modo === 'venda' || modo === 'aluguel' || modo === 'temporada') f.finalidade = modo;

  f.texto = p.get('q') ?? '';
  f.tipos = (p.get('t')?.split(',').filter(Boolean) ?? []) as TipoImovel[];
  f.precoMin = numeroOuNulo(p.get('pmin'));
  f.precoMax = numeroOuNulo(p.get('pmax'));
  f.areaMin = numeroOuNulo(p.get('amin'));
  f.areaMax = numeroOuNulo(p.get('amax'));
  f.quartosMin = numeroOuNulo(p.get('qt'));
  f.suitesMin = numeroOuNulo(p.get('st'));
  f.vagasMin = numeroOuNulo(p.get('vg'));
  f.caracteristicas = (p.get('c')?.split(',').filter(Boolean) ?? []) as Caracteristica[];
  f.setores = (p.get('s')?.split(',').filter(Boolean) ?? []) as Setor[];
  f.bairros = p.get('b')?.split(',').filter(Boolean) ?? [];
  f.somenteFavoritos = p.get('fav') === '1';
  f.somenteComFoto = p.get('foto') === '1';

  const ordem = p.get('o');
  const ordens: Ordenacao[] = [
    'oportunidade',
    'preco-asc',
    'preco-desc',
    'm2-asc',
    'area-desc',
    'recentes',
  ];
  if (ordem && (ordens as string[]).includes(ordem)) f.ordenacao = ordem as Ordenacao;

  const poly = p.get('poly');
  if (poly) {
    const pontos = poly
      .split(';')
      .map((par) => par.split(',').map(Number) as [number, number])
      .filter((par) => par.length === 2 && par.every(Number.isFinite));
    if (pontos.length >= 3) f.poligono = pontos;
  }
  return f;
}

// A leitura e a escrita da rota inteira (filtros + o que está aberto) ficam em navegacao.ts,
// que usa as duas funções acima. Aqui sobra só o que é local ao navegador.

// ---------------------------------------------------------------------------
// Favoritos e comparador — locais ao navegador, sem conta e sem servidor.
// ---------------------------------------------------------------------------

function useConjuntoPersistido(chave: string, limite = Infinity) {
  const [itens, setItens] = useState<Set<string>>(() => {
    try {
      const cru = localStorage.getItem(chave);
      return new Set<string>(cru ? (JSON.parse(cru) as string[]) : []);
    } catch {
      return new Set<string>();
    }
  });

  useEffect(() => {
    localStorage.setItem(chave, JSON.stringify([...itens]));
  }, [chave, itens]);

  const alternar = useCallback(
    (id: string) => {
      setItens((atual) => {
        const novo = new Set(atual);
        if (novo.has(id)) novo.delete(id);
        else if (novo.size < limite) novo.add(id);
        return novo;
      });
    },
    [limite],
  );

  const limpar = useCallback(() => setItens(new Set()), []);
  return { itens, alternar, limpar };
}

export const LIMITE_COMPARACAO = 4;

export function useFavoritos() {
  return useConjuntoPersistido('ilhabela.favoritos.v1');
}

export function useComparador() {
  return useConjuntoPersistido('ilhabela.comparar.v1', LIMITE_COMPARACAO);
}

/**
 * Compartilhar do Facebook ou do WhatsApp para o aplicativo instalado: o sistema abre o app
 * com o texto do post na URL (share_target do manifest). É o mais perto de "puxar do
 * Facebook" que existe sem violar os termos deles — vira um toque em vez de copiar, trocar
 * de aplicativo e colar.
 *
 * Funciona no Android e no Windows com o app instalado. O Safari do iPhone não implementa
 * share_target; lá o caminho continua sendo copiar e colar.
 *
 * Só lê. Tirar esses parâmetros da barra de endereços é trabalho da camada de navegação, que
 * reescreve a URL a partir da rota e naturalmente descarta o que não faz parte dela — e como
 * ela faz isso já no primeiro efeito, a leitura aqui precisa acontecer antes, na montagem.
 */
export function textoCompartilhado(): string | null {
  const p = new URLSearchParams(location.search);
  const partes = [p.get('titulo'), p.get('texto'), p.get('origem')].filter(Boolean);
  return partes.length ? partes.join('\n') : null;
}

export const ROTULO_MODO: Record<Finalidade, string> = {
  venda: 'Comprar',
  aluguel: 'Alugar',
  temporada: 'Temporada',
};
