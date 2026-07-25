import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { criarIndiceGeo, posicionar, resolverBairro } from './geocode';
import { pontoNaZona } from './geometry';
import type { Gazetteer, ZonesFile } from './types';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const gaz = JSON.parse(readFileSync(path.join(raiz, 'data/gazetteer.json'), 'utf8')) as Gazetteer;
const zonas = JSON.parse(readFileSync(path.join(raiz, 'data/zones.json'), 'utf8')) as ZonesFile;
const ix = criarIndiceGeo(gaz, zonas.zonas);

describe('resolverBairro', () => {
  it('acha o bairro no texto do anúncio, com ou sem acento', () => {
    expect(resolverBairro('Casa à venda no Perequê, Ilhabela', ix)?.id).toBe('pereque');
    expect(resolverBairro('CASA EM PEREQUE - ILHABELA/SP', ix)?.id).toBe('pereque');
    expect(resolverBairro('Terreno na Praia do Curral', ix)?.id).toBe('curral');
    expect(resolverBairro("Apartamento no Engenho d'Água", ix)?.id).toBe('engenho-dagua');
  });

  it('prefere o nome mais específico', () => {
    // "Praia Grande" não pode ser resolvido como um bairro qualquer que contenha "grande".
    expect(resolverBairro('Casa na Praia Grande', ix)?.id).toBe('praia-grande');
  });

  it('devolve null quando o bairro não aparece', () => {
    expect(resolverBairro('Casa em São Sebastião', ix)).toBeNull();
    expect(resolverBairro(null, ix)).toBeNull();
  });
});

describe('posicionar', () => {
  const bairro = gaz.bairros.find((b) => b.id === 'curral')!;

  it('coloca o pino dentro da zona do bairro', () => {
    const zona = zonas.zonas.find((z) => z.id === 'curral')!;
    for (const id of ['a1', 'b2', 'c3', 'd4', 'e5', 'f6']) {
      const p = posicionar(id, bairro, ix);
      expect(p.precisao).toBe('bairro');
      expect(pontoNaZona(p.lat, p.lon, zona.poligono)).toBe(true);
    }
  });

  it('é determinística: a mesma id devolve sempre a mesma posição', () => {
    const a = posicionar('imovel-42', bairro, ix);
    const b = posicionar('imovel-42', bairro, ix);
    expect([a.lat, a.lon]).toEqual([b.lat, b.lon]);
  });

  it('não empilha dois anúncios do mesmo bairro no mesmo ponto', () => {
    const a = posicionar('imovel-1', bairro, ix);
    const b = posicionar('imovel-2', bairro, ix);
    expect(a.lat === b.lat && a.lon === b.lon).toBe(false);
  });

  it('usa a coordenada do anúncio quando ela existe e marca precisão exata', () => {
    const zona = zonas.zonas.find((z) => z.id === 'pereque')!;
    const p = posicionar('x', bairro, ix, { lat: zona.ancora[0], lon: zona.ancora[1] });
    expect(p.precisao).toBe('exata');
    // A coordenada manda: o bairro é corrigido para a zona onde o ponto realmente cai.
    expect(p.bairroId).toBe('pereque');
  });

  it('ignora coordenada fora da ilha e cai para o bairro', () => {
    const p = posicionar('y', bairro, ix, { lat: -23.6, lon: -45.9 });
    expect(p.precisao).toBe('bairro');
    expect(p.bairroId).toBe('curral');
  });
});

describe('cobertura do gazetteer', () => {
  it('todo bairro tem zona correspondente', () => {
    for (const b of gaz.bairros) {
      expect(ix.zonaPorId.has(b.id), `zona ausente para ${b.nome}`).toBe(true);
    }
  });
});
