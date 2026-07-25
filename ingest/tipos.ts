import type { AnuncioBruto } from '../core/types';

/**
 * Contrato de um adapter. Um adapter sabe apenas buscar as páginas de uma fonte e devolver
 * anúncios crus; normalizar, geocodificar e deduplicar é responsabilidade do pipeline.
 */
export interface Adapter {
  /** Identificador estável — vira a chave no relatório e no campo `fonte` do anúncio. */
  id: string;
  nome: string;
  /** Endereço base, usado no relatório e para montar URLs absolutas. */
  site: string;
  /**
   * `navegador` exige Chromium (portais com anti-bot); `http` usa fetch simples.
   * O coletor pula os de navegador quando o Playwright não está disponível.
   */
  modo: 'http' | 'navegador';
  coletar(ctx: ContextoColeta): Promise<AnuncioBruto[]>;
}

export interface ContextoColeta {
  /** Busca uma página respeitando o intervalo entre requisições. */
  buscarHtml(url: string): Promise<string>;
  /** Abre a página em Chromium e devolve o HTML já renderizado. */
  buscarComNavegador(url: string, esperarPor?: string): Promise<string>;
  /** Limite de páginas por fonte, para o coletor não virar um rastreador sem freio. */
  maxPaginas: number;
  registrar(mensagem: string): void;
}
