import type { AnuncioBruto, Finalidade } from '../../core/types';
import { extrair, pareceAnuncioDeIlhabela } from '../extratores';
import type { Adapter, ContextoColeta } from '../tipos';

/**
 * Portais grandes.
 *
 * Foi confirmado em teste que VivaReal, ZAP e Imovelweb respondem 403 a requisição simples:
 * têm proteção anti-robô. Por isso estes adapters usam Chromium de verdade, com espera pelo
 * conteúdo carregado e ritmo lento. Mesmo assim a proteção pode vencer — e quando vencer, o
 * adapter registra a falha e sai sem derrubar o resto da coleta. As imobiliárias locais são
 * a fonte confiável; estes portais são ganho adicional.
 */
interface ConfigPortal {
  id: string;
  nome: string;
  site: string;
  vitrines: { url: string; finalidade: Finalidade }[];
  /** Seletor que indica que a lista terminou de carregar. */
  esperarPor: string;
}

const PORTAIS: ConfigPortal[] = [
  {
    id: 'vivareal',
    nome: 'Viva Real',
    site: 'https://www.vivareal.com.br',
    esperarPor: '[data-testid="house-card-container"], .property-card__container, article',
    vitrines: [
      { url: 'https://www.vivareal.com.br/venda/sp/ilhabela/', finalidade: 'venda' },
      { url: 'https://www.vivareal.com.br/aluguel/sp/ilhabela/', finalidade: 'aluguel' },
    ],
  },
  {
    id: 'zap',
    nome: 'Zap Imóveis',
    site: 'https://www.zapimoveis.com.br',
    esperarPor: '[data-testid="card"], .listing-wrapper, article',
    vitrines: [
      { url: 'https://www.zapimoveis.com.br/venda/imoveis/sp+ilhabela/', finalidade: 'venda' },
      { url: 'https://www.zapimoveis.com.br/aluguel/imoveis/sp+ilhabela/', finalidade: 'aluguel' },
    ],
  },
  {
    id: 'imovelweb',
    nome: 'Imovelweb',
    site: 'https://www.imovelweb.com.br',
    esperarPor: '[data-qa="posting PROPERTY"], .postingsList, article',
    vitrines: [
      { url: 'https://www.imovelweb.com.br/imoveis-venda-ilhabela-sp.html', finalidade: 'venda' },
      { url: 'https://www.imovelweb.com.br/imoveis-aluguel-ilhabela-sp.html', finalidade: 'aluguel' },
    ],
  },
  {
    id: 'olx',
    nome: 'OLX',
    site: 'https://www.olx.com.br',
    esperarPor: '[data-ds-component="DS-AdCard"], section, article',
    vitrines: [
      {
        url: 'https://www.olx.com.br/imoveis/venda/estado-sp/vale-do-paraiba-e-litoral-norte/ilhabela',
        finalidade: 'venda',
      },
      {
        url: 'https://www.olx.com.br/imoveis/aluguel/estado-sp/vale-do-paraiba-e-litoral-norte/ilhabela',
        finalidade: 'aluguel',
      },
    ],
  },
  {
    id: 'chavesnamao',
    nome: 'Chaves na Mão',
    site: 'https://www.chavesnamao.com.br',
    esperarPor: 'article, [class*="card"]',
    vitrines: [
      {
        url: 'https://www.chavesnamao.com.br/imoveis-a-venda/sp-ilhabela/',
        finalidade: 'venda',
      },
      {
        url: 'https://www.chavesnamao.com.br/imoveis-para-alugar/sp-ilhabela/',
        finalidade: 'aluguel',
      },
    ],
  },
  {
    id: 'lopes',
    nome: 'Lopes',
    site: 'https://www.lopes.com.br',
    esperarPor: 'article, [class*="card"], [class*="Card"]',
    vitrines: [
      { url: 'https://www.lopes.com.br/busca/venda/br/sp/ilhabela', finalidade: 'venda' },
      { url: 'https://www.lopes.com.br/busca/aluguel/br/sp/ilhabela', finalidade: 'aluguel' },
    ],
  },
  {
    id: 'agenteimovel',
    nome: 'Agente Imóvel',
    site: 'https://www.agenteimovel.com.br',
    esperarPor: 'article, [class*="card"], [class*="listing"]',
    vitrines: [
      {
        url: 'https://www.agenteimovel.com.br/imoveis/a-venda/sp/ilhabela/',
        finalidade: 'venda',
      },
      {
        url: 'https://www.agenteimovel.com.br/imoveis/aluguel/sp/ilhabela/',
        finalidade: 'aluguel',
      },
    ],
  },
  {
    id: 'wimoveis',
    nome: 'Wimoveis',
    site: 'https://www.wimoveis.com.br',
    esperarPor: '[data-qa="posting PROPERTY"], .postingsList, article',
    vitrines: [
      { url: 'https://www.wimoveis.com.br/venda/imoveis/sp/ilhabela', finalidade: 'venda' },
      { url: 'https://www.wimoveis.com.br/aluguel/imoveis/sp/ilhabela', finalidade: 'aluguel' },
    ],
  },
];

function criarAdapterPortal(config: ConfigPortal): Adapter {
  return {
    id: config.id,
    nome: config.nome,
    site: config.site,
    modo: 'navegador',
    async coletar(ctx: ContextoColeta): Promise<AnuncioBruto[]> {
      const coletados = new Map<string, AnuncioBruto>();

      for (const vitrine of config.vitrines) {
        let html: string;
        try {
          html = await ctx.buscarComNavegador(vitrine.url, config.esperarPor);
        } catch (e) {
          ctx.registrar(`${config.id}: ${vitrine.url} bloqueado ou lento (${(e as Error).message})`);
          continue;
        }

        const { anuncios, estrategia } = extrair(html, vitrine.url);
        ctx.registrar(`${config.id}: ${vitrine.url} → ${anuncios.length} anúncios via ${estrategia}`);

        for (const anuncio of anuncios) {
          if (!pareceAnuncioDeIlhabela(anuncio)) continue;
          const chave = anuncio.url || `${config.id}:${anuncio.titulo}`;
          if (coletados.has(chave)) continue;
          coletados.set(chave, {
            ...anuncio,
            fonte: config.id,
            nomeFonte: config.nome,
            finalidade: anuncio.finalidade ?? vitrine.finalidade,
          });
        }
      }

      return [...coletados.values()];
    },
  };
}

export const adaptersPortais: Adapter[] = PORTAIS.map(criarAdapterPortal);
