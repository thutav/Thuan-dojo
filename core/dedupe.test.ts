import { describe, expect, it } from 'vitest';
import { deduplicar } from './dedupe';
import type { Imovel } from './types';

function imovel(over: Partial<Imovel> & { id: string }): Imovel {
  return {
    titulo: 'Casa com piscina no Curral',
    finalidade: 'venda',
    tipo: 'casa',
    bairroId: 'curral',
    bairro: 'Curral',
    setor: 'sul',
    preco: 1_800_000,
    precoM2: 10_000,
    condominio: null,
    iptu: null,
    areaUtil: 180,
    areaTerreno: 450,
    quartos: 3,
    suites: 2,
    banheiros: 2,
    vagas: 2,
    caracteristicas: [],
    descricao: '',
    fotos: [],
    lat: -23.85,
    lon: -45.35,
    precisaoGeo: 'bairro',
    atualizadoEm: '2026-07-20',
    fontes: [
      {
        fonte: 'a',
        nomeFonte: 'Imobiliária A',
        url: `https://a.exemplo/${over.id}`,
        preco: over.preco ?? 1_800_000,
        coletadoEm: '2026-07-20',
      },
    ],
    ...over,
  };
}

describe('deduplicar', () => {
  it('junta o mesmo imóvel anunciado por três corretoras', () => {
    const entrada = [
      imovel({ id: '1', preco: 1_800_000 }),
      imovel({
        id: '2',
        preco: 1_850_000,
        titulo: 'Casa de alto padrão no Curral com piscina',
        fontes: [
          {
            fonte: 'b',
            nomeFonte: 'Imobiliária B',
            url: 'https://b.exemplo/9',
            preco: 1_850_000,
            coletadoEm: '2026-07-20',
          },
        ],
      }),
      imovel({
        id: '3',
        preco: 1_790_000,
        areaUtil: 182,
        fontes: [
          {
            fonte: 'c',
            nomeFonte: 'Imobiliária C',
            url: 'https://c.exemplo/7',
            preco: 1_790_000,
            coletadoEm: '2026-07-20',
          },
        ],
      }),
    ];

    const saida = deduplicar(entrada);
    expect(saida).toHaveLength(1);
    expect(saida[0].fontes).toHaveLength(3);
    // Quem procura quer o menor preço entre as vitrines.
    expect(saida[0].preco).toBe(1_790_000);
    expect(saida[0].divergenciaFontes).toBe(false);
  });

  it('não junta imóveis diferentes no mesmo bairro', () => {
    const saida = deduplicar([
      imovel({ id: '1', areaUtil: 180, preco: 1_800_000 }),
      imovel({ id: '2', areaUtil: 320, preco: 3_400_000, titulo: 'Casa nova em condomínio' }),
    ]);
    expect(saida).toHaveLength(2);
  });

  it('não junta anúncios de finalidades diferentes', () => {
    const saida = deduplicar([
      imovel({ id: '1' }),
      imovel({ id: '2', finalidade: 'aluguel', preco: 6_000, precoM2: 33 }),
    ]);
    expect(saida).toHaveLength(2);
  });

  it('marca divergência quando as fontes discordam muito do preço', () => {
    const saida = deduplicar([
      imovel({ id: '1', preco: 1_800_000 }),
      imovel({
        id: '2',
        preco: 2_400_000,
        titulo: 'Casa com piscina no Curral',
        fontes: [
          {
            fonte: 'b',
            nomeFonte: 'Imobiliária B',
            url: 'https://b.exemplo/9',
            preco: 2_400_000,
            coletadoEm: '2026-07-20',
          },
        ],
      }),
    ]);
    expect(saida).toHaveLength(1);
    expect(saida[0].divergenciaFontes).toBe(true);
    expect(saida[0].preco).toBe(1_800_000);
  });

  it('recalcula o preço por m² a partir do menor preço', () => {
    const saida = deduplicar([
      imovel({ id: '1', preco: 1_800_000, areaUtil: 180 }),
      imovel({
        id: '2',
        preco: 1_760_000,
        areaUtil: 180,
        fontes: [
          {
            fonte: 'b',
            nomeFonte: 'B',
            url: 'https://b.exemplo/2',
            preco: 1_760_000,
            coletadoEm: '2026-07-20',
          },
        ],
      }),
    ]);
    expect(saida[0].precoM2).toBe(Math.round(1_760_000 / 180));
  });
});
