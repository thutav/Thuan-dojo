/** Tipos compartilhados entre o coletor (Node) e o aplicativo (navegador). */

export type Finalidade = 'venda' | 'aluguel' | 'temporada';
export type TipoImovel = 'casa' | 'apartamento' | 'terreno' | 'comercial' | 'pousada' | 'outro';
export type Setor = 'norte' | 'centro' | 'sul' | 'leste' | 'costeira-sul';
export type PrecisaoGeo = 'exata' | 'bairro';

/** Coordenada em [lon, lat] — ordem do GeoJSON. */
export type Ponto = [number, number];
export type Ring = Ponto[];

export interface BairroGazetteer {
  id: string;
  nome: string;
  setor: Setor;
  ordemCosteira: number;
  lat: number;
  lon: number;
  praia: boolean;
  apelidos: string[];
}

export interface Gazetteer {
  _leiame?: string;
  bairros: BairroGazetteer[];
}

export interface Zona {
  id: string;
  nome: string;
  setor: Setor;
  ordemCosteira: number;
  /** [lat, lon] — pronto para o Leaflet. */
  ancora: [number, number];
  /** Anel externo em [lat, lon]. */
  poligono: [number, number][];
}

export interface ZonesFile {
  _leiame?: string;
  geradoEm: string;
  zonas: Zona[];
}

export interface OutlineFile {
  _leiame?: string;
  fonte: string;
  geradoEm: string;
  /** Ilha de São Sebastião, em [lon, lat]. */
  principal: Ring;
  /** Ilhotas do arquipélago, em [lon, lat]. */
  ilhotas: Ring[];
}

/**
 * Uma vitrine onde o imóvel apareceu. Um mesmo imóvel anunciado por três corretoras vira
 * um único `Imovel` com três `FonteAnuncio` — é isso que dá sentido a "agregar".
 */
export interface FonteAnuncio {
  fonte: string;
  nomeFonte: string;
  url: string;
  codigo?: string;
  /** Em reais: total na venda, mensal no aluguel, diária na temporada. */
  preco: number;
  coletadoEm: string;
}

export type Caracteristica =
  | 'vista-mar'
  | 'pe-na-areia'
  | 'piscina'
  | 'condominio-fechado'
  | 'mobiliado'
  | 'aceita-pet'
  | 'churrasqueira'
  | 'ar-condicionado'
  | 'vaga-barco'
  | 'area-gourmet';

export interface Imovel {
  id: string;
  titulo: string;
  finalidade: Finalidade;
  tipo: TipoImovel;
  bairroId: string;
  bairro: string;
  setor: Setor;
  /** Menor preço entre as fontes, na unidade da finalidade. */
  preco: number;
  /** preco / areaUtil, quando as duas informações existem. */
  precoM2: number | null;
  condominio: number | null;
  iptu: number | null;
  areaUtil: number | null;
  areaTerreno: number | null;
  quartos: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  caracteristicas: Caracteristica[];
  descricao: string;
  fotos: string[];
  lat: number;
  lon: number;
  precisaoGeo: PrecisaoGeo;
  fontes: FonteAnuncio[];
  /** Registro sintético de demonstração — nunca é dado de mercado real. */
  demo?: boolean;
  atualizadoEm: string;
  /** Preenchido pela comparação com o snapshot anterior. */
  variacaoPreco?: { pct: number; desde: string } | null;
  novo?: boolean;
  /** Fontes divergem em mais de 15% no preço do mesmo imóvel. */
  divergenciaFontes?: boolean;
}

export interface StatusFonte {
  fonte: string;
  nome: string;
  status: 'ok' | 'falha' | 'vazio';
  quantidade: number;
  mensagem?: string;
  duracaoMs: number;
}

export interface RelatorioColeta {
  executadoEm: string;
  fontes: StatusFonte[];
  totalBruto: number;
  totalAposDedupe: number;
}

export interface Dataset {
  _leiame?: string;
  geradoEm: string;
  /** true enquanto o conteúdo for a semente sintética. */
  demo: boolean;
  imoveis: Imovel[];
  relatorio: RelatorioColeta | null;
}

/** O que um adapter devolve: dados crus, ainda sem normalizar nem geocodificar. */
export interface AnuncioBruto {
  fonte: string;
  nomeFonte: string;
  url: string;
  codigo?: string;
  titulo: string;
  finalidade?: Finalidade | null;
  tipo?: TipoImovel | null;
  precoTexto?: string | null;
  preco?: number | null;
  bairroTexto?: string | null;
  areaUtilTexto?: string | null;
  areaTerrenoTexto?: string | null;
  quartos?: number | null;
  suites?: number | null;
  banheiros?: number | null;
  vagas?: number | null;
  descricao?: string | null;
  fotos?: string[];
  lat?: number | null;
  lon?: number | null;
}
