import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  acharProximaPagina,
  extrair,
  extrairJsonLd,
  extrairPorHeuristica,
  pareceAnuncioDeIlhabela,
} from './extratores';

const aqui = fileURLToPath(new URL('.', import.meta.url));
const ler = (nome: string) => readFileSync(path.join(aqui, 'fixtures', nome), 'utf8');
const BASE = 'https://exemplo-imobiliaria.com.br/venda';

describe('extrairJsonLd', () => {
  const html = ler('vitrine-jsonld.html');

  it('lê os imóveis publicados em schema.org', () => {
    const anuncios = extrairJsonLd(html, BASE);
    expect(anuncios).toHaveLength(4);

    const curral = anuncios[0];
    expect(curral.titulo).toBe('Casa com piscina na Praia do Curral');
    expect(curral.preco).toBe(1_850_000);
    expect(curral.bairroTexto).toBe('Curral');
    expect(curral.areaUtilTexto).toBe('182');
    expect(curral.areaTerrenoTexto).toBe('460');
    expect(curral.quartos).toBe(4);
    expect(curral.banheiros).toBe(3);
    expect(curral.lat).toBeCloseTo(-23.8512);
    expect(curral.url).toBe('https://exemplo-imobiliaria.com.br/imovel/casa-curral-1234');
    expect(curral.fotos?.[0]).toBe('https://exemplo-imobiliaria.com.br/fotos/1234-a.jpg');
  });

  it('não repete o mesmo imóvel', () => {
    const urls = extrairJsonLd(html, BASE).map((a) => a.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('sobrevive a JSON-LD quebrado', () => {
    const quebrado = '<script type="application/ld+json">{ isto não é json }</script>';
    expect(() => extrairJsonLd(quebrado, BASE)).not.toThrow();
    expect(extrairJsonLd(quebrado, BASE)).toHaveLength(0);
  });
});

describe('extrairPorHeuristica', () => {
  const html = ler('vitrine-html.html');

  it('lê a vitrine sem depender de classe CSS', () => {
    const anuncios = extrairPorHeuristica(html, BASE);
    expect(anuncios.length).toBe(5);

    const itaguacu = anuncios.find((a) => a.url.endsWith('/1201'));
    expect(itaguacu?.preco).toBe(1_290_000);
    expect(itaguacu?.quartos).toBe(3);
    expect(itaguacu?.suites).toBe(1);
    expect(itaguacu?.vagas).toBe(2);
    expect(itaguacu?.titulo).toContain('Itaguaçu');
  });

  it('junta os vários links que apontam para a mesma ficha', () => {
    const anuncios = extrairPorHeuristica(html, BASE);
    const cobertura = anuncios.filter((a) => a.url.endsWith('/1205'));
    expect(cobertura).toHaveLength(1);
  });

  it('ignora links de navegação sem preço', () => {
    const urls = extrairPorHeuristica(html, BASE).map((a) => a.url);
    expect(urls.some((u) => u.endsWith('/contato'))).toBe(false);
  });
});

describe('extrair', () => {
  it('prefere JSON-LD quando existe', () => {
    expect(extrair(ler('vitrine-jsonld.html'), BASE).estrategia).toBe('json-ld');
  });

  it('cai para a heurística quando não existe', () => {
    expect(extrair(ler('vitrine-html.html'), BASE).estrategia).toBe('heuristica');
  });

  it('avisa quando nada foi encontrado, em vez de devolver lixo', () => {
    const resultado = extrair('<html><body><p>Página em manutenção</p></body></html>', BASE);
    expect(resultado.estrategia).toBe('nenhuma');
    expect(resultado.anuncios).toHaveLength(0);
  });
});

describe('paginação', () => {
  it('acha o link da próxima página por rel=next', () => {
    expect(acharProximaPagina(ler('vitrine-jsonld.html'), BASE)).toBe(
      'https://exemplo-imobiliaria.com.br/venda?pagina=2',
    );
  });

  it('acha pela paginação numerada', () => {
    expect(acharProximaPagina(ler('vitrine-html.html'), BASE)).toBe(
      'https://exemplo-imobiliaria.com.br/venda?p=2',
    );
  });

  it('devolve null quando é a última página', () => {
    expect(acharProximaPagina('<html><body>fim</body></html>', BASE)).toBeNull();
  });
});

describe('pareceAnuncioDeIlhabela', () => {
  it('descarta imóvel de município vizinho', () => {
    const anuncios = extrairPorHeuristica(ler('vitrine-html.html'), BASE);
    const saoSebastiao = anuncios.find((a) => a.url.endsWith('/1204'))!;
    expect(pareceAnuncioDeIlhabela(saoSebastiao)).toBe(false);
  });

  it('mantém imóvel da ilha', () => {
    const anuncios = extrairPorHeuristica(ler('vitrine-html.html'), BASE);
    const pereque = anuncios.find((a) => a.url.endsWith('/1202'))!;
    expect(pareceAnuncioDeIlhabela(pereque)).toBe(true);
  });
});
