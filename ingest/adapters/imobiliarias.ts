import * as cheerio from 'cheerio';
import type { AnuncioBruto, Finalidade } from '../../core/types';
import { normalizar } from '../../core/texto';
import { acharProximaPagina, extrair, pareceAnuncioDeIlhabela } from '../extratores';
import type { Adapter, ContextoColeta } from '../tipos';

/**
 * Adapters das imobiliárias de Ilhabela.
 *
 * Cada site entra aqui só com endereço e algumas URLs de vitrine prováveis — a leitura em si
 * é feita pelos extratores genéricos (JSON-LD e heurística). Quando uma URL palpitada não
 * existe, o adapter não desiste: ele procura as vitrines a partir da página inicial. Isso
 * importa porque estes endereços não puderam ser conferidos no ambiente de desenvolvimento,
 * que não tem saída para a internet; a primeira execução no GitHub Actions é que confirma.
 */
export interface ConfigImobiliaria {
  id: string;
  nome: string;
  site: string;
  /** Vitrines conhecidas ou prováveis, com a finalidade que cada uma lista. */
  vitrines: { url: string; finalidade?: Finalidade }[];
  /** `navegador` para sites que montam a lista com JavaScript. */
  modo?: 'http' | 'navegador';
}

export const IMOBILIARIAS: ConfigImobiliaria[] = [
  {
    id: 'sergiohette',
    nome: 'Sérgio Hette Imóveis',
    site: 'https://sergiohette.com.br',
    vitrines: [
      { url: 'https://sergiohette.com.br/p-imoveis-venda-ilhabela.html', finalidade: 'venda' },
      { url: 'https://sergiohette.com.br/p-imoveis-locacao-ilhabela.html', finalidade: 'aluguel' },
    ],
  },
  {
    id: 'capitallitoral',
    nome: 'Capital Litoral Imóveis',
    site: 'https://capitallitoralimoveis.com.br',
    vitrines: [
      {
        url: 'https://capitallitoralimoveis.com.br/p-imoveis-venda-ilhabela.html',
        finalidade: 'venda',
      },
      {
        url: 'https://capitallitoralimoveis.com.br/p-imoveis-locacao-ilhabela.html',
        finalidade: 'aluguel',
      },
    ],
  },
  {
    // A lista deste site é montada por JavaScript, com a busca no fragmento da URL — o HTML
    // servido vem vazio. A primeira execução de teste devolveu 0 anúncios por isso.
    id: 'capitaldavela',
    nome: 'Capital da Vela Imóveis',
    site: 'https://www.capitaldavelaimoveis.com.br',
    modo: 'navegador',
    vitrines: [
      {
        url: 'https://www.capitaldavelaimoveis.com.br/imoveis/venda/#/?tipoNegocio=VA,VL&page=1',
        finalidade: 'venda',
      },
      {
        url: 'https://www.capitaldavelaimoveis.com.br/imoveis/locacao/#/?tipoNegocio=LO&page=1',
        finalidade: 'aluguel',
      },
    ],
  },
  // As três vitrines abaixo foram descobertas pela própria execução de teste, a partir da
  // página inicial: o palpite /imoveis dava 404 nos três. Ficam fixadas para a coleta não
  // gastar um 404 e uma rodada de descoberta a cada execução.
  {
    id: 'studiotrilha',
    nome: 'Studio Trilha Imobiliária',
    site: 'https://www.studiotrilha.com.br',
    vitrines: [{ url: 'https://www.studiotrilha.com.br/busca-imoveis' }],
  },
  {
    id: 'abidoia',
    nome: 'Alessandra Bidoia Imóveis',
    site: 'https://abidoia.com.br',
    vitrines: [
      { url: 'https://abidoia.com.br/imovel/?finalidade=venda', finalidade: 'venda' },
      { url: 'https://abidoia.com.br/imovel/?finalidade=locacao', finalidade: 'aluguel' },
    ],
  },
  {
    id: 'ilhabelaimoveis',
    nome: 'Ilhabela Imóveis',
    site: 'https://www.ilhabelaimoveis.com.br',
    vitrines: [{ url: 'https://www.ilhabelaimoveis.com.br/' }],
  },
];

const RE_LINK_VITRINE = /(imoveis|imovel|venda|locacao|loca%C3%A7%C3%A3o|aluguel|temporada|busca)/i;

/** Quando o palpite de URL falha, a própria página inicial diz onde estão as vitrines. */
export async function descobrirVitrines(
  html: string,
  site: string,
  limite = 4,
): Promise<string[]> {
  const $ = cheerio.load(html);
  const host = new URL(site).host;
  const achados = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    if (!RE_LINK_VITRINE.test(href)) return;
    let url: URL;
    try {
      url = new URL(href, site);
    } catch {
      return;
    }
    if (url.host !== host) return;
    // Ficha de imóvel individual costuma terminar em código; queremos as listagens.
    if (/\/(imovel|property)\/[\w-]*\d{3,}/i.test(url.pathname)) return;
    achados.add(url.toString());
  });

  return [...achados].slice(0, limite);
}

function finalidadeDaUrl(url: string): Finalidade | null {
  const t = normalizar(url);
  if (/temporada/.test(t)) return 'temporada';
  if (/(locacao|aluguel|alugar)/.test(t)) return 'aluguel';
  if (/(venda|comprar)/.test(t)) return 'venda';
  return null;
}

export function criarAdapterImobiliaria(config: ConfigImobiliaria): Adapter {
  return {
    id: config.id,
    nome: config.nome,
    site: config.site,
    modo: config.modo ?? 'http',
    async coletar(ctx: ContextoColeta): Promise<AnuncioBruto[]> {
      const coletados = new Map<string, AnuncioBruto>();
      const visitadas = new Set<string>();
      const buscar = (url: string) =>
        config.modo === 'navegador' ? ctx.buscarComNavegador(url) : ctx.buscarHtml(url);

      const percorrer = async (urlInicial: string, finalidade?: Finalidade) => {
        let url: string | null = urlInicial;
        for (let pagina = 0; pagina < ctx.maxPaginas && url; pagina++) {
          if (visitadas.has(url)) return;
          visitadas.add(url);

          let html: string;
          try {
            html = await buscar(url);
          } catch (e) {
            ctx.registrar(`${config.id}: ${url} falhou (${(e as Error).message})`);
            return;
          }

          const { anuncios, estrategia } = extrair(html, url);
          if (pagina === 0) {
            ctx.registrar(`${config.id}: ${url} → ${anuncios.length} anúncios via ${estrategia}`);
          }
          if (!anuncios.length) return;

          for (const anuncio of anuncios) {
            if (!pareceAnuncioDeIlhabela(anuncio)) continue;
            const chave = anuncio.url || `${config.id}:${anuncio.titulo}`;
            if (coletados.has(chave)) continue;
            coletados.set(chave, {
              ...anuncio,
              fonte: config.id,
              nomeFonte: config.nome,
              finalidade: anuncio.finalidade ?? finalidade ?? finalidadeDaUrl(url) ?? null,
            });
          }

          url = acharProximaPagina(html, url);
        }
      };

      for (const vitrine of config.vitrines) {
        await percorrer(vitrine.url, vitrine.finalidade);
      }

      // Nenhum palpite de URL funcionou: procura as vitrines a partir da página inicial.
      if (coletados.size === 0) {
        ctx.registrar(`${config.id}: nenhuma vitrine conhecida respondeu, procurando pelo site`);
        try {
          const inicial = await buscar(config.site);
          for (const url of await descobrirVitrines(inicial, config.site)) {
            await percorrer(url);
            if (coletados.size > 0) break;
          }
        } catch (e) {
          ctx.registrar(`${config.id}: página inicial inacessível (${(e as Error).message})`);
        }
      }

      return [...coletados.values()];
    },
  };
}

export const adaptersImobiliarias: Adapter[] = IMOBILIARIAS.map(criarAdapterImobiliaria);
