import { describe, expect, it } from 'vitest';
import { AMOSTRA_MINIMA, dealScore, estatisticasPorZona, mediana, quantil } from './stats';
import type { Imovel } from './types';

function imovel(id: string, bairroId: string, preco: number, area: number): Imovel {
  return {
    id,
    titulo: `Imóvel ${id}`,
    finalidade: 'venda',
    tipo: 'casa',
    bairroId,
    bairro: bairroId,
    setor: 'sul',
    preco,
    precoM2: Math.round(preco / area),
    condominio: null,
    iptu: null,
    areaUtil: area,
    areaTerreno: null,
    quartos: 3,
    suites: null,
    banheiros: null,
    vagas: null,
    caracteristicas: [],
    descricao: '',
    fotos: [],
    lat: -23.85,
    lon: -45.35,
    precisaoGeo: 'bairro',
    atualizadoEm: '2026-07-20',
    fontes: [],
  };
}

describe('mediana e quantil', () => {
  it('calcula com interpolação', () => {
    expect(mediana([1, 2, 3])).toBe(2);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
    expect(quantil([1, 2, 3, 4], 0.25)).toBe(1.75);
    expect(mediana([])).toBeNull();
  });
});

describe('estatisticasPorZona', () => {
  it('só publica preço por m² com amostra suficiente', () => {
    const poucos = Array.from({ length: AMOSTRA_MINIMA - 1 }, (_, i) =>
      imovel(`p${i}`, 'juliao', 1_000_000, 100),
    );
    const muitos = Array.from({ length: AMOSTRA_MINIMA + 3 }, (_, i) =>
      imovel(`m${i}`, 'curral', 1_000_000 + i * 100_000, 100),
    );

    const est = estatisticasPorZona([...poucos, ...muitos], { finalidade: 'venda' });
    expect(est.get('juliao')?.confiavel).toBe(false);
    expect(est.get('juliao')?.medianaPrecoM2).toBeNull();
    expect(est.get('curral')?.confiavel).toBe(true);
    expect(est.get('curral')?.medianaPrecoM2).toBeGreaterThan(0);
  });

  it('separa por finalidade', () => {
    const venda = imovel('v', 'curral', 2_000_000, 100);
    const aluguel: Imovel = { ...imovel('a', 'curral', 8_000, 100), finalidade: 'aluguel' };
    const est = estatisticasPorZona([venda, aluguel], { finalidade: 'aluguel' });
    expect(est.get('curral')?.n).toBe(1);
    expect(est.get('curral')?.medianaPreco).toBe(8_000);
  });
});

describe('dealScore', () => {
  const zona = Array.from({ length: 9 }, (_, i) => imovel(`z${i}`, 'curral', 1_000_000, 100));
  const estatisticas = estatisticasPorZona(zona, { finalidade: 'venda' });

  it('mede o desvio contra a mediana do bairro', () => {
    const barato = imovel('b', 'curral', 750_000, 100);
    const score = dealScore(barato, estatisticas);
    expect(score?.nivel).toBe('oportunidade');
    expect(score?.rotulo).toBe('25% abaixo da mediana do bairro');
  });

  it('não pontua quando a zona não tem amostra', () => {
    const semAmostra = estatisticasPorZona([imovel('u', 'bonete', 900_000, 100)], {
      finalidade: 'venda',
    });
    expect(dealScore(imovel('x', 'bonete', 500_000, 100), semAmostra)).toBeNull();
  });

  it('não pontua imóvel sem área informada', () => {
    const semArea: Imovel = { ...imovel('s', 'curral', 900_000, 100), areaUtil: null, precoM2: null };
    expect(dealScore(semArea, estatisticas)).toBeNull();
  });
});
