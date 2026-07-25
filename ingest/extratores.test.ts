import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodificar } from './http';
import {
  acharProximaPagina,
  ehLinkDeNavegacao,
  extrair,
  extrairJsonLd,
  extrairPorHeuristica,
  pareceAnuncioDeIlhabela,
  textoVisivel,
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

  it('acha a foto carregada de forma preguiçosa e descarta o logo', () => {
    const vila = extrairPorHeuristica(html, BASE).find((a) => a.url.endsWith('/1203'));
    expect(vila?.fotos).toEqual(['https://exemplo-imobiliaria.com.br/img/1203.jpg']);
  });

  it('lê a foto do anúncio quando ela vem no src normal', () => {
    const itaguacu = extrairPorHeuristica(html, BASE).find((a) => a.url.endsWith('/1201'));
    expect(itaguacu?.fotos?.[0]).toBe('https://exemplo-imobiliaria.com.br/img/1201.jpg');
  });

  it('ignora o bloco "Os mais Acessados", que agrupa anúncios e não é um imóvel', () => {
    const titulos = extrairPorHeuristica(html, BASE).map((a) => a.titulo);
    expect(titulos.some((t) => /mais Acessados/i.test(t))).toBe(false);
  });
});

describe('ehLinkDeNavegacao', () => {
  const listagem = 'https://www.olx.com.br/imoveis/venda/estado-sp/vale/ilhabela';

  it('reconhece migalha de pão', () => {
    expect(ehLinkDeNavegacao('https://www.olx.com.br/imoveis/venda', listagem)).toBe(true);
    expect(ehLinkDeNavegacao('https://www.olx.com.br/imoveis/venda/estado-sp', listagem)).toBe(true);
  });

  it('reconhece paginação e ordenação da própria listagem', () => {
    expect(ehLinkDeNavegacao(`${listagem}?o=2`, listagem)).toBe(true);
    expect(ehLinkDeNavegacao(`${listagem}?page=3`, listagem)).toBe(true);
    expect(ehLinkDeNavegacao(listagem, listagem)).toBe(true);
  });

  it('não confunde a ficha de um imóvel com navegação', () => {
    expect(ehLinkDeNavegacao('https://www.olx.com.br/imovel/casa-curral-123', listagem)).toBe(false);
    expect(ehLinkDeNavegacao('https://www.olx.com.br/imoveis/vendas-especiais', listagem)).toBe(false);
  });

  it('ignora link para outro site', () => {
    expect(ehLinkDeNavegacao('https://facebook.com/pagina', listagem)).toBe(false);
  });
});

describe('proteção contra card falso', () => {
  it('não transforma migalha de pão em imóvel', () => {
    const anuncios = extrairPorHeuristica(ler('vitrine-html.html'), BASE);
    const urls = anuncios.map((a) => a.url);
    expect(urls.some((u) => u.endsWith('/venda'))).toBe(false);
    expect(urls.some((u) => u.includes('ordem=preco'))).toBe(false);
  });

  it('rejeita bloco que contém a lista inteira em vez de um imóvel', () => {
    // O link sobe até o container da página, que tem preço e link: sem a checagem de
    // tamanho, ele vira um "imóvel" com o título da página e o preço do primeiro anúncio.
    const paginaInteira = `<html><body><div id="tudo">
      <a href="/outra-secao">Ver tudo</a>
      ${Array.from({ length: 6 }, (_, i) => `<p>Casa ${i} com 120 m² por R$ ${900 + i}.000,00 em Ilhabela, bairro Curral, com piscina e vista para o mar</p>`).join('')}
    </div></body></html>`;
    const anuncios = extrairPorHeuristica(paginaInteira, BASE);
    expect(anuncios).toHaveLength(0);
  });
});

describe('textoVisivel', () => {
  it('devolve o texto da ficha sem script nem estilo', () => {
    const texto = textoVisivel(ler('ficha-imovel.html'));
    expect(texto).toContain('Feiticeira');
    expect(texto).toContain('IL2291');
    expect(texto).not.toContain('rastreio');
    expect(texto).not.toContain('display: none');
  });
});

describe('decodificar', () => {
  const bytes = (texto: string, codificacao: 'latin1' | 'utf8') =>
    new Uint8Array(Buffer.from(texto, codificacao)).buffer;

  it('lê página em ISO-8859-1 declarada no cabeçalho', () => {
    const html = decodificar(bytes('bairro Armação', 'latin1'), 'text/html; charset=iso-8859-1');
    expect(html).toContain('Armação');
  });

  it('lê página em ISO-8859-1 declarada só no meta da página', () => {
    const pagina = '<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1"><p>Armação</p>';
    expect(decodificar(bytes(pagina, 'latin1'), 'text/html')).toContain('Armação');
  });

  it('mantém UTF-8 quando é o caso', () => {
    expect(decodificar(bytes('Perequê', 'utf8'), 'text/html; charset=utf-8')).toContain('Perequê');
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
