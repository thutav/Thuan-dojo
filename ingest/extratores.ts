import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { AnuncioBruto } from '../core/types';
import {
  PADROES,
  ROTULO_CONSTRUIDO,
  ROTULO_TERRENO,
  acharAreaRotulada,
  parseArea,
  parsePreco,
  parseQuantidade,
} from '../core/normalize';
import { normalizar } from '../core/texto';

/**
 * Dois extratores genéricos, aplicados em ordem antes de qualquer seletor específico:
 *
 *  1. JSON-LD (schema.org) — quando o site publica dados estruturados, sai tudo certinho e
 *     nenhum seletor precisa ser escrito nem mantido.
 *  2. Heurística de vitrine — quando não há JSON-LD, procura os blocos que repetem "R$" com
 *     um link e lê o texto. Site de imobiliária muda de layout com frequência; ler o texto
 *     visível sobrevive a redesenho melhor do que uma lista de classes CSS.
 *
 * Um adapter só precisa de seletor próprio quando estes dois falham.
 */

function absoluta(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

// ---------------------------------------------------------------------------
// 1. JSON-LD
// ---------------------------------------------------------------------------

const TIPOS_INTERESSANTES = new Set([
  'realestatelisting',
  'product',
  'offer',
  'house',
  'apartment',
  'singlefamilyresidence',
  'residence',
  'accommodation',
  'place',
  'lodgingbusiness',
]);

function achatar(no: unknown, saida: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(no)) {
    for (const item of no) achatar(item, saida);
    return saida;
  }
  if (no && typeof no === 'object') {
    const obj = no as Record<string, unknown>;
    saida.push(obj);
    for (const valor of Object.values(obj)) {
      if (valor && typeof valor === 'object') achatar(valor, saida);
    }
  }
  return saida;
}

function texto(valor: unknown): string | null {
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number') return String(valor);
  if (valor && typeof valor === 'object') {
    const obj = valor as Record<string, unknown>;
    return texto(obj.value ?? obj.name ?? obj['@value']);
  }
  return null;
}

function tipoDoNo(obj: Record<string, unknown>): string[] {
  const t = obj['@type'];
  const lista = Array.isArray(t) ? t : [t];
  return lista.filter((x): x is string => typeof x === 'string').map((x) => x.toLowerCase());
}

export function extrairJsonLd(html: string, urlBase: string): AnuncioBruto[] {
  const $ = cheerio.load(html);
  const anuncios: AnuncioBruto[] = [];
  const vistos = new Set<string>();

  $('script[type="application/ld+json"]').each((_, el) => {
    const cru = $(el).contents().text().trim();
    if (!cru) return;
    let dados: unknown;
    try {
      dados = JSON.parse(cru);
    } catch {
      return; // JSON-LD quebrado é comum; ignorar esse bloco e seguir
    }

    for (const no of achatar(dados)) {
      const tipos = tipoDoNo(no);
      if (!tipos.some((t) => TIPOS_INTERESSANTES.has(t))) continue;

      const nome = texto(no.name) ?? texto(no.headline);
      if (!nome) continue;

      const oferta = (Array.isArray(no.offers) ? no.offers[0] : no.offers) as
        | Record<string, unknown>
        | undefined;
      const precoCru =
        texto(oferta?.price) ?? texto(oferta?.lowPrice) ?? texto(no.price) ?? null;

      const url = absoluta(texto(no.url) ?? texto(oferta?.url) ?? '', urlBase);
      const chave = url || nome;
      if (vistos.has(chave)) continue;
      vistos.add(chave);

      const endereco = no.address as Record<string, unknown> | undefined;
      const bairro =
        texto(endereco?.addressLocality) ??
        texto(endereco?.streetAddress) ??
        texto(no.areaServed) ??
        null;

      const tamanho = no.floorSize as Record<string, unknown> | undefined;
      const terreno = no.lotSize as Record<string, unknown> | undefined;
      const imagens = (Array.isArray(no.image) ? no.image : [no.image])
        .map((i) => texto(i))
        .filter((i): i is string => !!i)
        .map((i) => absoluta(i, urlBase));

      anuncios.push({
        fonte: '',
        nomeFonte: '',
        url,
        titulo: nome,
        precoTexto: precoCru,
        preco: precoCru ? parsePreco(precoCru) : null,
        bairroTexto: bairro,
        areaUtilTexto: texto(tamanho?.value) ?? texto(no.floorSize) ?? null,
        areaTerrenoTexto: texto(terreno?.value) ?? null,
        quartos: Number(texto(no.numberOfRooms) ?? texto(no.numberOfBedrooms) ?? NaN) || null,
        banheiros: Number(texto(no.numberOfBathroomsTotal) ?? NaN) || null,
        descricao: texto(no.description),
        fotos: imagens,
        lat: Number(texto((no.geo as Record<string, unknown>)?.latitude) ?? NaN) || null,
        lon: Number(texto((no.geo as Record<string, unknown>)?.longitude) ?? NaN) || null,
      });
    }
  });

  return anuncios;
}

// ---------------------------------------------------------------------------
// 2. Heurística de vitrine
// ---------------------------------------------------------------------------

const RE_PRECO_NO_TEXTO = /r\$\s*[\d.,]+/i;

/** Sobe na árvore até o menor bloco que tem preço e link — o "card" do anúncio. */
function acharCartao($: cheerio.CheerioAPI, elemento: AnyNode): cheerio.Cheerio<AnyNode> | null {
  let atual = $(elemento);
  for (let nivel = 0; nivel < 6; nivel++) {
    const pai = atual.parent();
    if (!pai.length || pai.is('body, html')) break;
    atual = pai;
    const t = atual.text();
    if (RE_PRECO_NO_TEXTO.test(t) && atual.find('a[href]').length) return atual;
  }
  return null;
}

/**
 * Blocos de vitrine que não são imóvel: "Os mais acessados", "Destaques" e afins agrupam
 * vários anúncios e têm preço dentro, então a heurística os confundia com um card.
 */
const TITULOS_GENERICOS =
  /^(os? mais (acessad|vist|procurad)|destaques?|lancamentos?|imoveis em destaque|ultimos imoveis|novidades|busca|newsletter|receba|filtrar)/;

/** Logos, ícones e placeholders de carregamento não são foto do imóvel. */
const IMAGEM_IRRELEVANTE = /(logo|icone|icon|placeholder|blank|sprite|avatar|selo|bandeira|whatsapp\.(png|svg))/i;

/**
 * Sites modernos quase nunca põem a foto no `src`: ela fica em `data-src`, `data-lazy` ou no
 * `srcset`, e o `src` carrega um pixel transparente. Ler só o `src` devolvia zero foto em
 * alguns sites — e foto é metade da decisão de quem procura casa.
 */
function extrairFotos(
  $: cheerio.CheerioAPI,
  cartao: cheerio.Cheerio<AnyNode>,
  urlBase: string,
  limite = 4,
): string[] {
  const achadas: string[] = [];

  cartao.find('img, source').each((_, el) => {
    if (achadas.length >= limite) return;
    const alvo = $(el);
    const candidatos = [
      alvo.attr('src'),
      alvo.attr('data-src'),
      alvo.attr('data-original'),
      alvo.attr('data-lazy'),
      alvo.attr('data-lazy-src'),
      alvo.attr('data-image'),
      // No srcset a última entrada costuma ser a de maior resolução.
      alvo.attr('srcset')?.split(',').pop()?.trim().split(/\s+/)[0],
      alvo.attr('data-srcset')?.split(',').pop()?.trim().split(/\s+/)[0],
    ];

    for (const candidato of candidatos) {
      if (!candidato || candidato.startsWith('data:')) continue;
      if (IMAGEM_IRRELEVANTE.test(candidato)) continue;
      const url = absoluta(candidato, urlBase);
      if (!achadas.includes(url)) achadas.push(url);
      break;
    }
  });

  // Fundo definido por style="background-image:url(...)" também é foto de imóvel.
  if (!achadas.length) {
    const estilo = cartao.find('[style*="background-image"]').first().attr('style') ?? '';
    const url = estilo.match(/url\((["']?)(.*?)\1\)/)?.[2];
    if (url && !url.startsWith('data:') && !IMAGEM_IRRELEVANTE.test(url)) {
      achadas.push(absoluta(url, urlBase));
    }
  }

  return achadas;
}

function melhorTitulo(cartao: cheerio.Cheerio<AnyNode>, link: cheerio.Cheerio<AnyNode>): string {
  const candidatos = [
    link.attr('title'),
    cartao.find('h1, h2, h3, h4').first().text(),
    link.text(),
    cartao.find('[class*="titulo"], [class*="title"]').first().text(),
  ];
  for (const c of candidatos) {
    const limpo = (c ?? '').replace(/\s+/g, ' ').trim();
    if (limpo.length >= 8 && limpo.length <= 160) return limpo;
  }
  return (cartao.text() ?? '').replace(/\s+/g, ' ').trim().slice(0, 90);
}

export function extrairPorHeuristica(html: string, urlBase: string): AnuncioBruto[] {
  const $ = cheerio.load(html);
  const porUrl = new Map<string, AnuncioBruto>();

  $('a[href]').each((_, el) => {
    const link = $(el);
    const href = link.attr('href') ?? '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
      return;
    }

    const cartao = acharCartao($, el);
    if (!cartao) return;

    const textoCartao = cartao.text().replace(/\s+/g, ' ').trim();
    const preco = parsePreco(textoCartao.match(RE_PRECO_NO_TEXTO)?.[0] ?? null);

    // Quando o card diz qual metragem é qual, respeita o rótulo: sem isso, "terreno de
    // 1.680 m²" virava área construída e o imóvel aparecia como 93% abaixo do bairro.
    const areaTerreno = acharAreaRotulada(textoCartao, ROTULO_TERRENO);
    const areaConstruida = acharAreaRotulada(textoCartao, ROTULO_CONSTRUIDO);
    const primeiraMedida = parseArea(textoCartao.match(/(\d[\d.,]*)\s*(?:m²|m2)/i)?.[0] ?? null);
    const areaUtil =
      areaConstruida ?? (primeiraMedida !== null && primeiraMedida !== areaTerreno ? primeiraMedida : null);
    if (preco === null && areaUtil === null && areaTerreno === null) return;

    const url = absoluta(href, urlBase);
    // Vários links apontam para a mesma ficha (foto, título, botão): fica o mais completo.
    const existente = porUrl.get(url);
    const titulo = melhorTitulo(cartao, link);
    if (TITULOS_GENERICOS.test(normalizar(titulo))) return;
    if (existente && (existente.titulo?.length ?? 0) >= titulo.length) return;

    porUrl.set(url, {
      fonte: '',
      nomeFonte: '',
      url,
      titulo,
      precoTexto: textoCartao.match(RE_PRECO_NO_TEXTO)?.[0] ?? null,
      preco,
      bairroTexto: textoCartao,
      areaUtilTexto: areaUtil !== null ? String(areaUtil) : null,
      areaTerrenoTexto: areaTerreno !== null ? String(areaTerreno) : null,
      quartos: parseQuantidade(textoCartao, PADROES.quartos),
      suites: parseQuantidade(textoCartao, PADROES.suites),
      banheiros: parseQuantidade(textoCartao, PADROES.banheiros),
      vagas: parseQuantidade(textoCartao, PADROES.vagas),
      descricao: textoCartao.slice(0, 400),
      fotos: extrairFotos($, cartao, urlBase),
    });
  });

  return [...porUrl.values()];
}

/**
 * Roda os extratores em ordem e devolve o primeiro que trouxe resultado utilizável.
 * O nome da estratégia vencedora entra no relatório: quando um site sai do JSON-LD e cai na
 * heurística, isso aparece antes de virar um dataset ruim.
 */
export function extrair(
  html: string,
  urlBase: string,
): { anuncios: AnuncioBruto[]; estrategia: 'json-ld' | 'heuristica' | 'nenhuma' } {
  const porJsonLd = extrairJsonLd(html, urlBase);
  if (porJsonLd.length >= 3) return { anuncios: porJsonLd, estrategia: 'json-ld' };

  const porHeuristica = extrairPorHeuristica(html, urlBase);
  if (porHeuristica.length > porJsonLd.length) {
    return { anuncios: porHeuristica, estrategia: 'heuristica' };
  }
  if (porJsonLd.length) return { anuncios: porJsonLd, estrategia: 'json-ld' };
  return { anuncios: [], estrategia: 'nenhuma' };
}

/** Texto visível da página, sem script nem estilo — base para achar o bairro numa ficha. */
export function textoVisivel(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg').remove();
  return $('body').text().replace(/\s+/g, ' ').trim().slice(0, 6000);
}

/** Descobre links de paginação para o coletor não depender de um padrão fixo de URL. */
export function acharProximaPagina(html: string, urlAtual: string): string | null {
  const $ = cheerio.load(html);
  const candidato =
    $('a[rel="next"]').attr('href') ??
    $('link[rel="next"]').attr('href') ??
    $('a')
      .filter((_, el) => /^(pr[oó]xim[ao]|next|»|>)$/i.test($(el).text().trim()))
      .first()
      .attr('href') ??
    $('.pagination a.active, .paginacao a.ativo')
      .first()
      .next('a')
      .attr('href');

  if (!candidato) return null;
  const url = absoluta(candidato, urlAtual);
  return url === urlAtual ? null : url;
}

/**
 * Filtra o que claramente não é imóvel de Ilhabela. O domínio fica de fora da checagem de
 * propósito: em "ilhabelaimoveis.com.br" toda URL contém "ilhabela", e isso perdoaria até
 * um anúncio de Caraguatatuba publicado no site.
 */
export function pareceAnuncioDeIlhabela(anuncio: AnuncioBruto): boolean {
  let caminho = '';
  try {
    caminho = new URL(anuncio.url).pathname;
  } catch {
    caminho = '';
  }
  const t = normalizar(`${anuncio.titulo} ${anuncio.bairroTexto ?? ''} ${caminho}`);
  if (/(sao sebastiao|caraguatatuba|ubatuba|bertioga|maresias)/.test(t) && !/ilhabela/.test(t)) {
    return false;
  }
  return true;
}
