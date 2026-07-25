import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Finalidade, Imovel } from '@core/types';
import {
  aplicarFiltros,
  calcularEstatisticas,
  carregarBase,
  carregarLocais,
  contarFiltrosAtivos,
  faixaDePreco,
  ordenar,
  salvarLocais,
  type BaseApp,
} from './dados';
import { LIMITE_COMPARACAO, ROTULO_MODO, useComparador, useFavoritos, useFiltrosNaUrl } from './estado';
import { Mapa, metricasDisponiveis, type Metrica } from './Mapa';
import { Painel } from './Painel';
import { Comparador, FichaImovel } from './Ficha';
import { ModalFiltros } from './Filtros';
import { ColarAnuncio } from './Colar';
import { PainelMercado } from './Mercado';
import {
  IconeColar,
  IconeComparar,
  IconeCoracao,
  IconeDesenhar,
  IconeGrafico,
  Simbolo,
} from './icones';

const MODOS: Finalidade[] = ['venda', 'aluguel', 'temporada'];

type ModalAberto = 'nenhum' | 'filtros' | 'comparar' | 'colar' | 'mercado';

export function App() {
  const [base, setBase] = useState<BaseApp | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [locais, setLocais] = useState<Imovel[]>([]);
  const [filtros, atualizarFiltros] = useFiltrosNaUrl();
  const favoritos = useFavoritos();
  const comparador = useComparador();

  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [destacado, setDestacado] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalAberto>('nenhum');
  const [metrica, setMetrica] = useState<Metrica>('precoM2');
  const [mostrarZonas, setMostrarZonas] = useState(true);
  const [mostrarPinos, setMostrarPinos] = useState(true);
  const [usarTiles, setUsarTiles] = useState(false);
  const [desenhando, setDesenhando] = useState(false);
  const [vistaMobile, setVistaMobile] = useState<'lista' | 'mapa'>('mapa');

  useEffect(() => {
    carregarBase()
      .then((b) => {
        setBase(b);
        setLocais(carregarLocais());
      })
      .catch((e: Error) => setErro(e.message));
  }, []);

  // A diária por m² é um número pequeno e pouco intuitivo; na temporada o mapa abre pelo
  // preço da diária, que é como as pessoas comparam de fato.
  useEffect(() => {
    setMetrica(filtros.finalidade === 'temporada' ? 'preco' : 'precoM2');
  }, [filtros.finalidade]);

  const todos = useMemo(() => base?.dataset.imoveis ?? [], [base]);

  const estatisticas = useMemo(
    () => calcularEstatisticas(todos, filtros.finalidade),
    [todos, filtros.finalidade],
  );

  const filtrados = useMemo(
    () => ordenar(aplicarFiltros(todos, filtros, favoritos.itens), filtros.ordenacao, estatisticas),
    [todos, filtros, favoritos.itens, estatisticas],
  );

  const imoveisDoModo = useMemo(
    () => todos.filter((i) => i.finalidade === filtros.finalidade),
    [todos, filtros.finalidade],
  );

  const porId = useMemo(() => new Map(todos.map((i) => [i.id, i])), [todos]);
  const imovelSelecionado = selecionado ? porId.get(selecionado) : undefined;
  const emComparacao = [...comparador.itens].map((id) => porId.get(id)).filter((i): i is Imovel => !!i);
  const filtrosAtivos = contarFiltrosAtivos(filtros);

  const aoClicarZona = useCallback(
    (bairroId: string) => {
      atualizarFiltros((f) => ({
        ...f,
        bairros: f.bairros.includes(bairroId)
          ? f.bairros.filter((b) => b !== bairroId)
          : [...f.bairros, bairroId],
      }));
    },
    [atualizarFiltros],
  );

  const aoDesenhar = useCallback(
    (poligono: [number, number][] | null) => {
      atualizarFiltros((f) => ({ ...f, poligono }));
      setDesenhando(false);
    },
    [atualizarFiltros],
  );

  const salvarColado = (imovel: Imovel) => {
    const novos = [...locais, imovel];
    setLocais(novos);
    salvarLocais(novos);
    setBase((b) =>
      b ? { ...b, dataset: { ...b.dataset, imoveis: [...b.dataset.imoveis, imovel] } } : b,
    );
    setModal('nenhum');
    setSelecionado(imovel.id);
  };

  if (erro) {
    return (
      <div className="carregando" role="alert">
        {erro}
      </div>
    );
  }

  if (!base) {
    return (
      <div className="carregando" role="status">
        carregando a ilha…
      </div>
    );
  }

  const metricas = metricasDisponiveis(filtros.finalidade);

  return (
    <div className="app">
      <header className="cabecalho">
        <div className="marca">
          <span className="simbolo">
            <Simbolo />
          </span>
          <div>
            <h1>Ilhabela Imóveis</h1>
            <div className="sub">preço por m² · mapa vivo</div>
          </div>
        </div>

        <div className="modos" role="group" aria-label="O que você procura">
          {MODOS.map((m) => (
            <button
              key={m}
              aria-pressed={filtros.finalidade === m}
              onClick={() => atualizarFiltros((f) => ({ ...f, finalidade: m }))}
            >
              {ROTULO_MODO[m]}
            </button>
          ))}
        </div>

        <div className="acoes-cabecalho">
          <button
            className="botao"
            aria-pressed={filtros.somenteFavoritos}
            onClick={() => atualizarFiltros((f) => ({ ...f, somenteFavoritos: !f.somenteFavoritos }))}
            title="Ver somente os favoritos"
          >
            <IconeCoracao preenchido={filtros.somenteFavoritos} />
            {favoritos.itens.size > 0 && <span className="contador">{favoritos.itens.size}</span>}
          </button>
          <button className="botao" onClick={() => setModal('comparar')} title="Comparar imóveis">
            <IconeComparar />
            Comparar
            {comparador.itens.size > 0 && (
              <span className="contador">
                {comparador.itens.size}/{LIMITE_COMPARACAO}
              </span>
            )}
          </button>
          <button className="botao" onClick={() => setModal('mercado')}>
            <IconeGrafico />
            Mercado
          </button>
          <button className="botao primario" onClick={() => setModal('colar')}>
            <IconeColar />
            Colar anúncio
          </button>
        </div>
      </header>

      {base.demo && (
        <div className="faixa-demo" role="status">
          <strong>demonstração</strong>
          <span>
            Estes {base.dataset.imoveis.filter((i) => i.demo).length} anúncios são sintéticos,
            gerados para você conferir o aplicativo. Não são o mercado real — somem sozinhos na
            primeira coleta.
          </span>
        </div>
      )}

      <div className="corpo" data-vista={vistaMobile}>
        <Painel
          filtros={filtros}
          imoveis={filtrados}
          totalNoModo={imoveisDoModo.length}
          estatisticas={estatisticas}
          favoritos={favoritos.itens}
          comparando={comparador.itens}
          destacado={destacado}
          finalidade={filtros.finalidade}
          aoMudarFiltros={atualizarFiltros}
          aoAbrirFiltros={() => setModal('filtros')}
          aoAbrir={setSelecionado}
          aoFavoritar={favoritos.alternar}
          aoComparar={comparador.alternar}
          aoDestacar={setDestacado}
        />

        <div className="area-mapa">
          <Mapa
            outline={base.outline}
            zonas={base.zonas}
            imoveis={filtrados}
            estatisticas={estatisticas}
            finalidade={filtros.finalidade}
            metrica={metrica}
            mostrarZonas={mostrarZonas}
            mostrarPinos={mostrarPinos}
            usarTiles={usarTiles}
            destacado={destacado}
            favoritos={favoritos.itens}
            bairrosSelecionados={filtros.bairros}
            poligono={filtros.poligono}
            desenhando={desenhando}
            aoSelecionar={setSelecionado}
            aoDestacar={setDestacado}
            aoClicarZona={aoClicarZona}
            aoDesenhar={aoDesenhar}
          />

          <div className="painel-mapa controles-mapa">
            <label className="rotulo" htmlFor="metrica-mapa">
              Cor das zonas
            </label>
            <select
              id="metrica-mapa"
              value={metrica}
              onChange={(e) => setMetrica(e.target.value as Metrica)}
            >
              {metricas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.rotulo}
                </option>
              ))}
            </select>

            <div className="linha-toggles">
              <button
                className="chip"
                aria-pressed={mostrarZonas}
                onClick={() => setMostrarZonas((v) => !v)}
              >
                Zonas
              </button>
              <button
                className="chip"
                aria-pressed={mostrarPinos}
                onClick={() => setMostrarPinos((v) => !v)}
              >
                Pinos
              </button>
              <button
                className="chip"
                aria-pressed={usarTiles}
                onClick={() => setUsarTiles((v) => !v)}
                title="Sobrepõe o mapa de ruas do OpenStreetMap (precisa de internet)"
              >
                Ruas
              </button>
              <button
                className="chip"
                aria-pressed={desenhando || !!filtros.poligono}
                onClick={() => {
                  if (filtros.poligono) {
                    atualizarFiltros((f) => ({ ...f, poligono: null }));
                    setDesenhando(false);
                  } else {
                    setDesenhando((v) => !v);
                  }
                }}
                title="Desenhar uma área no mapa para filtrar"
              >
                <IconeDesenhar />
                {filtros.poligono ? 'Limpar área' : 'Desenhar'}
              </button>
            </div>

            {filtrosAtivos > 0 && (
              <button
                className="chip limpar"
                onClick={() =>
                  atualizarFiltros((f) => ({
                    ...f,
                    texto: '',
                    tipos: [],
                    precoMin: null,
                    precoMax: null,
                    areaMin: null,
                    areaMax: null,
                    quartosMin: null,
                    suitesMin: null,
                    vagasMin: null,
                    caracteristicas: [],
                    setores: [],
                    bairros: [],
                    somenteFavoritos: false,
                    somenteComFoto: false,
                    poligono: null,
                  }))
                }
              >
                Limpar {filtrosAtivos} {filtrosAtivos === 1 ? 'filtro' : 'filtros'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="aba-mobile" role="group" aria-label="Alternar entre lista e mapa">
        <button aria-pressed={vistaMobile === 'lista'} onClick={() => setVistaMobile('lista')}>
          Lista
        </button>
        <button aria-pressed={vistaMobile === 'mapa'} onClick={() => setVistaMobile('mapa')}>
          Mapa
        </button>
      </div>

      {imovelSelecionado && (
        <FichaImovel
          imovel={imovelSelecionado}
          estatisticas={estatisticas}
          favorito={favoritos.itens.has(imovelSelecionado.id)}
          comparando={comparador.itens.has(imovelSelecionado.id)}
          aoFavoritar={favoritos.alternar}
          aoComparar={comparador.alternar}
          aoFechar={() => setSelecionado(null)}
        />
      )}

      {modal === 'filtros' && (
        <ModalFiltros
          filtros={filtros}
          zonas={base.zonas}
          faixaPreco={faixaDePreco(todos, filtros.finalidade)}
          finalidade={filtros.finalidade}
          aoMudar={atualizarFiltros}
          aoFechar={() => setModal('nenhum')}
        />
      )}

      {modal === 'comparar' && (
        <Comparador
          imoveis={emComparacao}
          estatisticas={estatisticas}
          aoRemover={comparador.alternar}
          aoLimpar={comparador.limpar}
          aoFechar={() => setModal('nenhum')}
        />
      )}

      {modal === 'colar' && (
        <ColarAnuncio
          gazetteer={base.gazetteer}
          indiceGeo={base.indiceGeo}
          aoSalvar={salvarColado}
          aoFechar={() => setModal('nenhum')}
        />
      )}

      {modal === 'mercado' && (
        <PainelMercado
          dataset={base.dataset}
          zonas={base.zonas}
          imoveisDoModo={imoveisDoModo}
          estatisticas={estatisticas}
          finalidade={filtros.finalidade}
          aoFechar={() => setModal('nenhum')}
        />
      )}
    </div>
  );
}
