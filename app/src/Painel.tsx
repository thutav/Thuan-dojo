import { memo } from 'react';
import type { EstatisticaZona } from '@core/stats';
import { dealScore } from '@core/stats';
import {
  formatarArea,
  formatarNumero,
  formatarPreco,
  formatarPrecoM2,
  plural,
  rotuloCaracteristica,
  rotuloTipo,
} from '@core/format';
import type { Caracteristica, Finalidade, Imovel, TipoImovel } from '@core/types';
import type { Filtros, Ordenacao } from './dados';
import { IconeCasa, IconeComparar, IconeCoracao, IconeLupa } from './icones';

const TIPOS_RAPIDOS: TipoImovel[] = ['casa', 'apartamento', 'terreno'];
const CARACTERISTICAS_RAPIDAS: Caracteristica[] = [
  'vista-mar',
  'pe-na-areia',
  'piscina',
  'condominio-fechado',
];

const ORDENS: { id: Ordenacao; rotulo: string }[] = [
  { id: 'oportunidade', rotulo: 'Melhor negócio' },
  { id: 'preco-asc', rotulo: 'Menor preço' },
  { id: 'preco-desc', rotulo: 'Maior preço' },
  { id: 'm2-asc', rotulo: 'Menor preço por m²' },
  { id: 'area-desc', rotulo: 'Maior área' },
  { id: 'recentes', rotulo: 'Mais recentes' },
];

export interface PropsCard {
  imovel: Imovel;
  estatisticas: Map<string, EstatisticaZona>;
  favorito: boolean;
  comparando: boolean;
  destacado: boolean;
  aoAbrir: (id: string) => void;
  aoFavoritar: (id: string) => void;
  aoComparar: (id: string) => void;
  aoDestacar: (id: string | null) => void;
}

export const CardImovel = memo(function CardImovel(props: PropsCard) {
  const { imovel, estatisticas, favorito, comparando, destacado } = props;
  const score = dealScore(imovel, estatisticas);
  const quantidadeFontes = imovel.fontes.length;

  return (
    <div
      className={`card${destacado ? ' destacado' : ''}`}
      onMouseEnter={() => props.aoDestacar(imovel.id)}
      onMouseLeave={() => props.aoDestacar(null)}
    >
      <button
        className="miniatura"
        onClick={() => props.aoAbrir(imovel.id)}
        aria-label={`Abrir ficha de ${imovel.titulo}`}
      >
        {imovel.fotos[0] ? (
          <img src={imovel.fotos[0]} alt="" loading="lazy" />
        ) : (
          <IconeCasa tamanho={26} />
        )}
      </button>

      <div className="corpo-card">
        <button
          onClick={() => props.aoAbrir(imovel.id)}
          style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4 }}
        >
          <div className="preco">{formatarPreco(imovel.preco, imovel.finalidade)}</div>
          <div className="por-m2">
            {imovel.precoM2
              ? formatarPrecoM2(imovel.precoM2, imovel.finalidade)
              : 'sem área informada'}
          </div>
          <div className="titulo">{imovel.titulo}</div>
          <div className="local">
            {imovel.bairro}
            {imovel.precisaoGeo === 'bairro' && (
              <span className="mono" style={{ fontSize: 10, opacity: 0.7 }} title="Posição aproximada: o anúncio informa o bairro, não o endereço">
                aprox.
              </span>
            )}
          </div>
          <div className="specs">
            <span>{rotuloTipo(imovel.tipo)}</span>
            {imovel.quartos !== null && <span>{plural(imovel.quartos, 'quarto', 'quartos')}</span>}
            {imovel.suites !== null && imovel.suites > 0 && (
              <span>{plural(imovel.suites, 'suíte', 'suítes')}</span>
            )}
            {imovel.vagas !== null && imovel.vagas > 0 && (
              <span>{plural(imovel.vagas, 'vaga', 'vagas')}</span>
            )}
            {(imovel.areaUtil ?? imovel.areaTerreno) !== null && (
              <span>{formatarArea(imovel.areaUtil ?? imovel.areaTerreno)}</span>
            )}
          </div>
        </button>

        <div className="selos">
          {imovel.demo && <span className="selo demo">demo</span>}
          {score && score.nivel !== 'na-media' && (
            <span
              className={`selo ${score.nivel === 'acima' ? 'acima' : score.nivel === 'oportunidade' ? 'oportunidade' : 'abaixo'}`}
            >
              {score.rotulo}
            </span>
          )}
          {imovel.variacaoPreco && imovel.variacaoPreco.pct < 0 && (
            <span className="selo baixou">
              baixou {Math.abs(Math.round(imovel.variacaoPreco.pct * 100))}%
            </span>
          )}
          {imovel.novo && <span className="selo novo">novo</span>}
          {quantidadeFontes > 1 && (
            <span className="selo fontes">{quantidadeFontes} anúncios</span>
          )}
        </div>
      </div>

      <div className="acoes-card">
        <button
          className="acao-mini"
          aria-pressed={favorito}
          aria-label={favorito ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
          title={favorito ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
          onClick={() => props.aoFavoritar(imovel.id)}
        >
          <IconeCoracao preenchido={favorito} />
        </button>
        <button
          className="acao-mini"
          aria-pressed={comparando}
          aria-label={comparando ? 'Tirar da comparação' : 'Adicionar à comparação'}
          title={comparando ? 'Tirar da comparação' : 'Adicionar à comparação'}
          onClick={() => props.aoComparar(imovel.id)}
        >
          <IconeComparar />
        </button>
      </div>
    </div>
  );
});

export interface PropsPainel {
  filtros: Filtros;
  imoveis: Imovel[];
  totalNoModo: number;
  estatisticas: Map<string, EstatisticaZona>;
  favoritos: Set<string>;
  comparando: Set<string>;
  destacado: string | null;
  finalidade: Finalidade;
  aoMudarFiltros: (atualizar: (f: Filtros) => Filtros) => void;
  aoAbrirFiltros: () => void;
  aoAbrir: (id: string) => void;
  aoFavoritar: (id: string) => void;
  aoComparar: (id: string) => void;
  aoDestacar: (id: string | null) => void;
}

export function Painel(props: PropsPainel) {
  const { filtros, imoveis, totalNoModo, finalidade } = props;

  const alternarTipo = (tipo: TipoImovel) =>
    props.aoMudarFiltros((f) => ({
      ...f,
      tipos: f.tipos.includes(tipo) ? f.tipos.filter((t) => t !== tipo) : [...f.tipos, tipo],
    }));

  const alternarCaracteristica = (c: Caracteristica) =>
    props.aoMudarFiltros((f) => ({
      ...f,
      caracteristicas: f.caracteristicas.includes(c)
        ? f.caracteristicas.filter((x) => x !== c)
        : [...f.caracteristicas, c],
    }));

  return (
    <section className="painel" aria-label="Resultados da busca">
      <div className="busca">
        <div className="campo-busca">
          <IconeLupa />
          <input
            type="search"
            value={filtros.texto}
            placeholder="Bairro, praia ou o que você procura…"
            aria-label="Buscar por bairro, praia ou palavra do anúncio"
            onChange={(e) => props.aoMudarFiltros((f) => ({ ...f, texto: e.target.value }))}
          />
        </div>

        <div className="chips">
          {TIPOS_RAPIDOS.map((tipo) => (
            <button
              key={tipo}
              className="chip"
              aria-pressed={filtros.tipos.includes(tipo)}
              onClick={() => alternarTipo(tipo)}
            >
              {rotuloTipo(tipo)}
            </button>
          ))}
          {CARACTERISTICAS_RAPIDAS.map((c) => (
            <button
              key={c}
              className="chip"
              aria-pressed={filtros.caracteristicas.includes(c)}
              onClick={() => alternarCaracteristica(c)}
            >
              {rotuloCaracteristica(c)}
            </button>
          ))}
          <button className="chip limpar" onClick={props.aoAbrirFiltros}>
            Mais filtros…
          </button>
        </div>
      </div>

      <div className="barra-resultados">
        <span>
          <strong>{formatarNumero(imoveis.length)}</strong>
          {imoveis.length === 1 ? ' imóvel' : ' imóveis'}
          {imoveis.length !== totalNoModo && (
            <span className="mono" style={{ opacity: 0.7 }}>
              {' '}
              de {formatarNumero(totalNoModo)}
            </span>
          )}
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="aviso-visual-oculto">Ordenar por</span>
          <select
            value={filtros.ordenacao}
            onChange={(e) =>
              props.aoMudarFiltros((f) => ({ ...f, ordenacao: e.target.value as Ordenacao }))
            }
          >
            {ORDENS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="lista">
        {imoveis.length === 0 ? (
          <p className="vazio">
            Nenhum imóvel com esses filtros.
            <br />
            {totalNoModo === 0
              ? `Ainda não há anúncios de ${finalidade === 'venda' ? 'venda' : finalidade === 'aluguel' ? 'aluguel anual' : 'temporada'} na base.`
              : 'Tente ampliar a faixa de preço ou limpar alguns filtros.'}
          </p>
        ) : (
          imoveis.map((imovel) => (
            <CardImovel
              key={imovel.id}
              imovel={imovel}
              estatisticas={props.estatisticas}
              favorito={props.favoritos.has(imovel.id)}
              comparando={props.comparando.has(imovel.id)}
              destacado={props.destacado === imovel.id}
              aoAbrir={props.aoAbrir}
              aoFavoritar={props.aoFavoritar}
              aoComparar={props.aoComparar}
              aoDestacar={props.aoDestacar}
            />
          ))
        )}
      </div>
    </section>
  );
}
