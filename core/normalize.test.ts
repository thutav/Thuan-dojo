import { describe, expect, it } from 'vitest';
import {
  detectCaracteristicas,
  detectFinalidade,
  detectTipo,
  parseArea,
  parsePreco,
  parseQuantidade,
  PADROES,
} from './normalize';
import { parseNumeroBR, similaridade } from './texto';

describe('parseNumeroBR', () => {
  it('lê separadores brasileiros', () => {
    expect(parseNumeroBR('1.200.000')).toBe(1_200_000);
    expect(parseNumeroBR('1.200.000,50')).toBe(1_200_000.5);
    expect(parseNumeroBR('1,2')).toBe(1.2);
    expect(parseNumeroBR('850')).toBe(850);
    expect(parseNumeroBR('1.2')).toBe(1.2); // ponto decimal, não milhar (grupo com 1 dígito)
    expect(parseNumeroBR('sem número')).toBeNull();
  });
});

describe('parsePreco', () => {
  it('lê os formatos que aparecem em anúncio de verdade', () => {
    expect(parsePreco('R$ 1.200.000')).toBe(1_200_000);
    expect(parsePreco('R$1.850.000,00')).toBe(1_850_000);
    expect(parsePreco('1,2 milhões')).toBe(1_200_000);
    expect(parsePreco('R$ 850 mil')).toBe(850_000);
    expect(parsePreco('R$ 4.500/mês')).toBe(4_500);
    expect(parsePreco('R$ 350 a diária')).toBe(350);
    expect(parsePreco('R$ 1,2 mi')).toBe(1_200_000);
  });

  it('não inventa preço quando o anúncio não dá', () => {
    expect(parsePreco('Preço sob consulta')).toBeNull();
    expect(parsePreco('valor a combinar')).toBeNull();
    expect(parsePreco(null)).toBeNull();
    expect(parsePreco('casa linda na praia')).toBeNull();
  });
});

describe('parseArea', () => {
  it('lê metragens', () => {
    expect(parseArea('120 m²')).toBe(120);
    expect(parseArea('120m2')).toBe(120);
    expect(parseArea('1.200 metros quadrados')).toBe(1200);
    expect(parseArea('120,5 m²')).toBe(120.5);
    expect(parseArea('sem metragem')).toBeNull();
  });
});

describe('parseQuantidade', () => {
  it('entende dígito e número escrito', () => {
    expect(parseQuantidade('3 quartos', PADROES.quartos)).toBe(3);
    expect(parseQuantidade('três suítes', PADROES.suites)).toBe(3);
    expect(parseQuantidade('2 vagas de garagem', PADROES.vagas)).toBe(2);
    expect(parseQuantidade('casa sem essa informação', PADROES.quartos)).toBeNull();
  });
});

describe('detecções', () => {
  it('classifica finalidade', () => {
    expect(detectFinalidade('Aluguel por temporada, diária a partir de R$ 400')).toBe('temporada');
    expect(detectFinalidade('Aluguel anual, R$ 3.000/mês')).toBe('aluguel');
    expect(detectFinalidade('Vende-se casa no Curral')).toBe('venda');
    expect(detectFinalidade('Casa bonita')).toBeNull();
  });

  it('classifica tipo', () => {
    expect(detectTipo('Terreno plano em Perequê')).toBe('terreno');
    expect(detectTipo('Apartamento 2 dorms')).toBe('apartamento');
    expect(detectTipo('Sobrado com piscina')).toBe('casa');
    expect(detectTipo('Pousada com 8 suítes')).toBe('pousada');
  });

  it('acha características', () => {
    const c = detectCaracteristicas('Casa pé na areia, com piscina e vista para o mar, aceita pet');
    expect(c).toContain('pe-na-areia');
    expect(c).toContain('piscina');
    expect(c).toContain('vista-mar');
    expect(c).toContain('aceita-pet');
    expect(c).not.toContain('churrasqueira');
  });
});

describe('similaridade', () => {
  it('aproxima títulos do mesmo imóvel e separa imóveis diferentes', () => {
    const a = 'Casa alto padrão na Praia do Curral com piscina';
    const b = 'Casa de alto padrão no Curral com piscina';
    const c = 'Terreno em Borrifos';
    expect(similaridade(a, b)).toBeGreaterThan(0.5);
    expect(similaridade(a, c)).toBeLessThan(0.2);
  });
});
