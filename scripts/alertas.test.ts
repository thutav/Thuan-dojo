import { describe, expect, it } from 'vitest';
import type { Dataset, Imovel } from '../core/types';
import { avaliarAlertas, montarRelatorio } from './alertas';

function imovel(over: Partial<Imovel> & { id: string }): Imovel {
  return {
    titulo: `Imóvel ${over.id}`,
    finalidade: 'venda',
    tipo: 'casa',
    bairroId: 'curral',
    bairro: 'Curral',
    setor: 'sul',
    preco: 1_000_000,
    precoM2: 10_000,
    condominio: null,
    iptu: null,
    areaUtil: 100,
    areaTerreno: null,
    quartos: 3,
    suites: 1,
    banheiros: 2,
    vagas: 2,
    caracteristicas: [],
    descricao: '',
    fotos: [],
    lat: -23.85,
    lon: -45.35,
    precisaoGeo: 'bairro',
    atualizadoEm: '2026-07-25',
    fontes: [
      { fonte: 'a', nomeFonte: 'Corretora A', url: 'https://a.exemplo/1', preco: over.preco ?? 1_000_000, coletadoEm: '2026-07-25' },
    ],
    novo: false,
    variacaoPreco: null,
    ...over,
  };
}

function base(imoveis: Imovel[]): Dataset {
  return { geradoEm: '2026-07-25', demo: false, imoveis, relatorio: null };
}

describe('avaliarAlertas', () => {
  it('avisa do imóvel novo que casa com o filtro', () => {
    const dataset = base([
      imovel({ id: 'novo-barato', preco: 900_000, novo: true }),
      imovel({ id: 'novo-caro', preco: 3_000_000, novo: true }),
      imovel({ id: 'antigo-barato', preco: 800_000 }),
    ]);

    const r = avaliarAlertas(dataset, [
      { nome: 'Casa até 1,5 mi', finalidade: 'venda', tipos: ['casa'], precoMax: 1_500_000 },
    ]);

    expect(r).toHaveLength(1);
    expect(r[0].achados.map((a) => a.imovel.id)).toEqual(['novo-barato']);
    expect(r[0].achados[0].motivo).toBe('novo na base');
  });

  it('avisa quando o preço baixou, mesmo sem ser novo', () => {
    const dataset = base([
      imovel({ id: 'baixou', preco: 950_000, variacaoPreco: { pct: -0.12, desde: '2026-06-01' } }),
      imovel({ id: 'oscilou', preco: 990_000, variacaoPreco: { pct: -0.01, desde: '2026-06-01' } }),
    ]);

    const r = avaliarAlertas(dataset, [{ nome: 'Qualquer casa', finalidade: 'venda' }]);
    expect(r[0].achados.map((a) => a.imovel.id)).toEqual(['baixou']);
    expect(r[0].achados[0].motivo).toBe('baixou 12%');
  });

  it('não avisa nada quando nada mudou desde a última coleta', () => {
    const dataset = base([imovel({ id: 'parado' }), imovel({ id: 'parado2' })]);
    expect(avaliarAlertas(dataset, [{ nome: 'Tudo', finalidade: 'venda' }])).toHaveLength(0);
  });

  it('respeita o desconto mínimo contra a mediana do bairro', () => {
    // Nove imóveis a R$ 10.000/m² formam a mediana do bairro; o novo entra 30% abaixo.
    const zona = Array.from({ length: 9 }, (_, i) => imovel({ id: `z${i}` }));
    const dataset = base([
      ...zona,
      imovel({ id: 'oportunidade', preco: 700_000, precoM2: 7_000, novo: true }),
      imovel({ id: 'na-media', preco: 1_020_000, precoM2: 10_200, novo: true }),
    ]);

    const r = avaliarAlertas(dataset, [
      { nome: 'Só oportunidade', finalidade: 'venda', descontoMinimo: 0.15 },
    ]);
    expect(r[0].achados.map((a) => a.imovel.id)).toEqual(['oportunidade']);
    expect(r[0].achados[0].score).toContain('abaixo da mediana');
  });

  it('ignora alerta desligado', () => {
    const dataset = base([imovel({ id: 'novo', novo: true })]);
    expect(avaliarAlertas(dataset, [{ nome: 'Desligado', ativo: false, finalidade: 'venda' }])).toHaveLength(0);
  });

  it('separa por finalidade', () => {
    const dataset = base([
      imovel({ id: 'venda', novo: true }),
      imovel({ id: 'aluguel', finalidade: 'aluguel', preco: 4_000, precoM2: 40, novo: true }),
    ]);
    const r = avaliarAlertas(dataset, [{ nome: 'Aluguel', finalidade: 'aluguel' }]);
    expect(r[0].achados.map((a) => a.imovel.id)).toEqual(['aluguel']);
  });
});

describe('montarRelatorio', () => {
  it('monta uma tabela com link para o anúncio e aponta o imóvel repetido', () => {
    const repetido = imovel({
      id: 'repetido',
      novo: true,
      preco: 900_000,
      fontes: [
        { fonte: 'a', nomeFonte: 'Corretora A', url: 'https://a.exemplo/9', preco: 900_000, coletadoEm: '2026-07-25' },
        { fonte: 'b', nomeFonte: 'Corretora B', url: 'https://b.exemplo/9', preco: 980_000, coletadoEm: '2026-07-25' },
      ],
    });
    const resultados = avaliarAlertas(base([repetido]), [{ nome: 'Tudo', finalidade: 'venda' }]);
    const md = montarRelatorio(resultados, '2026-07-25');

    expect(md).toContain('## Tudo');
    expect(md).toContain('https://a.exemplo/9');
    expect(md).toContain('está em 2 corretoras');
    // O formatador de moeda do pt-BR separa o símbolo do número com espaço não separável.
    expect(md).toMatch(/Corretora B \(R\$.980\.000\)/);
  });
});
