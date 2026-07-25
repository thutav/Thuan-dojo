import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { criarIndiceGeo } from '../core/geocode';
import type { AnuncioBruto, Gazetteer, Imovel, ZonesFile } from '../core/types';
import { aplicarHistorico, enriquecerBairros, normalizarAnuncio } from './pipeline';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const gaz = JSON.parse(readFileSync(path.join(raiz, 'data/gazetteer.json'), 'utf8')) as Gazetteer;
const zonas = JSON.parse(readFileSync(path.join(raiz, 'data/zones.json'), 'utf8')) as ZonesFile;
const ix = criarIndiceGeo(gaz, zonas.zonas);
const HOJE = '2026-07-25';

function bruto(over: Partial<AnuncioBruto> = {}): AnuncioBruto {
  return {
    fonte: 'exemplo',
    nomeFonte: 'Imobiliária Exemplo',
    url: 'https://exemplo.com.br/imoveis/1',
    titulo: 'Casa com 3 dormitórios na Praia do Curral',
    precoTexto: 'R$ 1.850.000',
    bairroTexto: 'Curral — Ilhabela/SP',
    areaUtilTexto: '182 m²',
    ...over,
  };
}

describe('normalizarAnuncio', () => {
  it('monta o imóvel completo a partir do anúncio cru', () => {
    const r = normalizarAnuncio(bruto(), ix, HOJE);
    expect('imovel' in r).toBe(true);
    if (!('imovel' in r)) return;

    const i = r.imovel;
    expect(i.preco).toBe(1_850_000);
    expect(i.bairroId).toBe('curral');
    expect(i.areaUtil).toBe(182);
    expect(i.precoM2).toBe(Math.round(1_850_000 / 182));
    expect(i.quartos).toBe(3);
    expect(i.tipo).toBe('casa');
    expect(i.precisaoGeo).toBe('bairro');
    expect(i.fontes[0].url).toBe('https://exemplo.com.br/imoveis/1');
  });

  it('gera o mesmo id para o mesmo anúncio em coletas diferentes', () => {
    const a = normalizarAnuncio(bruto(), ix, HOJE);
    const b = normalizarAnuncio(bruto(), ix, '2026-08-01');
    if (!('imovel' in a) || !('imovel' in b)) throw new Error('deveria normalizar');
    expect(a.imovel.id).toBe(b.imovel.id);
  });

  it('descarta anúncio sem preço', () => {
    const r = normalizarAnuncio(bruto({ precoTexto: 'Sob consulta' }), ix, HOJE);
    expect(r).toEqual({ descarte: 'sem preço' });
  });

  it('descarta anúncio de município vizinho antes de geocodificar', () => {
    // "Centro" também existe em Caraguatatuba: sem o filtro, este anúncio viraria um imóvel
    // da Vila e entraria na mediana do bairro.
    const r = normalizarAnuncio(
      bruto({ titulo: 'Casa no centro', bairroTexto: 'Centro — Caraguatatuba' }),
      ix,
      HOJE,
    );
    expect(r).toEqual({ descarte: 'município vizinho' });
  });

  it('descarta anúncio de bairro que não existe na ilha', () => {
    const r = normalizarAnuncio(
      bruto({ titulo: 'Casa no Jardim das Flores', bairroTexto: 'Jardim das Flores — Ilhabela/SP' }),
      ix,
      HOJE,
    );
    expect(r).toEqual({ descarte: 'bairro não reconhecido' });
  });

  it('descarta preço incompatível com a finalidade, para não sujar a mediana', () => {
    const aluguelAbsurdo = normalizarAnuncio(
      bruto({ titulo: 'Aluguel anual no Perequê', precoTexto: 'R$ 950.000' }),
      ix,
      HOJE,
    );
    expect(aluguelAbsurdo).toEqual({ descarte: 'preço alto demais para aluguel' });

    const vendaAbsurda = normalizarAnuncio(
      bruto({ titulo: 'Vende-se casa no Curral', precoTexto: 'R$ 4.500' }),
      ix,
      HOJE,
    );
    expect(vendaAbsurda).toEqual({ descarte: 'preço baixo demais para venda' });
  });

  it('usa a coordenada do anúncio quando ela vem no JSON-LD', () => {
    const zona = zonas.zonas.find((z) => z.id === 'pereque')!;
    const r = normalizarAnuncio(
      bruto({ lat: zona.ancora[0], lon: zona.ancora[1] }),
      ix,
      HOJE,
    );
    if (!('imovel' in r)) throw new Error('deveria normalizar');
    expect(r.imovel.precisaoGeo).toBe('exata');
    expect(r.imovel.bairroId).toBe('pereque');
  });
});

describe('enriquecerBairros', () => {
  const fichaComBairro = readFileSync(path.join(raiz, 'ingest/fixtures/ficha-imovel.html'), 'utf8');

  function contextoFalso(paginas: Record<string, string>) {
    const pedidas: string[] = [];
    return {
      pedidas,
      ctx: {
        maxPaginas: 8,
        registrar: () => {},
        async buscarHtml(url: string) {
          pedidas.push(url);
          const html = paginas[url];
          if (!html) throw new Error('HTTP 404');
          return html;
        },
        async buscarComNavegador() {
          throw new Error('não usado');
        },
      },
    };
  }

  it('abre a ficha e acha o bairro que a vitrine não mostrava', async () => {
    const orfao = bruto({
      titulo: 'Casa de Condomínio em Ilhabela com 3 dormitórios',
      bairroTexto: 'Casa de Condomínio em Ilhabela com 3 dormitórios R$ 2.100.000',
      url: 'https://exemplo.com.br/imoveis/2291',
    });
    const { ctx, pedidas } = contextoFalso({ 'https://exemplo.com.br/imoveis/2291': fichaComBairro });

    const r = await enriquecerBairros([orfao], ctx, ix, 10);
    expect(r.tentativas).toBe(1);
    expect(r.resolvidos).toBe(1);
    expect(pedidas).toEqual(['https://exemplo.com.br/imoveis/2291']);

    const normalizado = normalizarAnuncio(orfao, ix, HOJE);
    if (!('imovel' in normalizado)) throw new Error('deveria normalizar após o enriquecimento');
    expect(normalizado.imovel.bairroId).toBe('feiticeira');
  });

  it('não abre ficha de anúncio que já tem bairro', async () => {
    const { ctx, pedidas } = contextoFalso({});
    const r = await enriquecerBairros([bruto()], ctx, ix, 10);
    expect(r.tentativas).toBe(0);
    expect(pedidas).toHaveLength(0);
  });

  it('respeita o teto de fichas por execução', async () => {
    const orfaos = Array.from({ length: 5 }, (_, i) =>
      bruto({ titulo: 'Casa em Ilhabela', bairroTexto: 'Casa em Ilhabela', url: `https://exemplo.com.br/i/${i}` }),
    );
    const { ctx, pedidas } = contextoFalso({});
    const r = await enriquecerBairros(orfaos, ctx, ix, 2);
    expect(r.tentativas).toBe(2);
    expect(pedidas).toHaveLength(2);
  });

  it('ficha fora do ar não interrompe a coleta', async () => {
    const orfao = bruto({ titulo: 'Casa em Ilhabela', bairroTexto: 'Casa em Ilhabela' });
    const { ctx } = contextoFalso({});
    await expect(enriquecerBairros([orfao], ctx, ix, 5)).resolves.toEqual({
      tentativas: 1,
      resolvidos: 0,
    });
  });
});

describe('aplicarHistorico', () => {
  const coleta = (preco: number, data = HOJE): Imovel[] => {
    const r = normalizarAnuncio(bruto({ precoTexto: `R$ ${preco}` }), ix, data);
    if (!('imovel' in r)) throw new Error('deveria normalizar');
    return [r.imovel];
  };

  it('marca tudo como conhecido quando não há coleta anterior', () => {
    const saida = aplicarHistorico(coleta(1_850_000), null, HOJE);
    expect(saida[0].novo).toBe(false);
    expect(saida[0].variacaoPreco).toBeNull();
  });

  it('marca como novo o que não existia antes', () => {
    const anterior = coleta(1_850_000).map((i) => ({ ...i, id: 'outro' }));
    const saida = aplicarHistorico(coleta(1_850_000), anterior, HOJE);
    expect(saida[0].novo).toBe(true);
  });

  it('calcula a queda de preço entre coletas', () => {
    const anterior = aplicarHistorico(coleta(2_000_000, '2026-06-01'), null, '2026-06-01');
    const saida = aplicarHistorico(coleta(1_800_000), anterior, HOJE);
    expect(saida[0].novo).toBe(false);
    expect(saida[0].variacaoPreco?.pct).toBeCloseTo(-0.1);
    expect(saida[0].variacaoPreco?.desde).toBe('2026-06-01');
    expect(saida[0].atualizadoEm).toBe(HOJE);
  });

  it('preserva a data de atualização quando o preço não muda', () => {
    const anterior = aplicarHistorico(coleta(1_850_000, '2026-06-01'), null, '2026-06-01');
    const saida = aplicarHistorico(coleta(1_850_000), anterior, HOJE);
    expect(saida[0].atualizadoEm).toBe('2026-06-01');
  });
});
