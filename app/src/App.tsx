import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
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
  type Filtros,
} from './dados';
import {
  LIMITE_COMPARACAO,
  ROTULO_MODO,
  filtrosParaUrl,
  textoCompartilhado,
  useComparador,
  useFavoritos,
} from './estado';
import { useNavegacao, type ModoNavegacao, type Vista } from './navegacao';
import { Mapa, metricasDisponiveis, type Metrica } from './Mapa';
import { Painel } from './Painel';
import { Comparador, FichaImovel } from './Ficha';
import { ModalFiltros } from './Filtros';
import { ColarAnuncio } from './Colar';

// O painel de mercado carrega a biblioteca de gráficos, que pesa mais do que todo o resto da
// tela inicial. Quem abre o aplicativo na fila da balsa quer a busca; os gráficos só chegam
// quando alguém realmente pede por eles.
const PainelMercado = lazy(() =>
  import('./Mercado').then((m) => ({ default: m.PainelMercado })),
);
import {
  IconeColar,
  IconeComparar,
  IconeCoracao,
  IconeDesenhar,
  IconeGrafico,
  Simbolo,
} from './icones';

const MODOS: Finalidade[] = ['venda', 'aluguel', 'temporada'];

export function App() {
  const [base, setBase] = useState<BaseApp | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [locais, setLocais] = useState<Imovel[]>([]);
  const { rota, navegar, voltar } = useNavegacao();
  const { filtros, imovel: selecionado, vista: modal, aba: vistaMobile } = rota;
  const favoritos = useFavoritos();
  const comparador = useComparador();

  // Trocar os filtros é a operação mais comum da tela: sai da rota inteira para uma função
  // com a mesma assinatura de antes, para os componentes filhos não precisarem saber de rota.
  const atualizarFiltros = useCallback(
    (fn: (f: Filtros) => Filtros, modo: ModoNavegacao = 'trocar') =>
      navegar((r) => ({ filtros: fn(r.filtros) }), modo),
    [navegar],
  );

  const [destacado, setDestacado] = useState<string | null>(null);
  const [metrica, setMetrica] = useState<Metrica>('precoM2');
  const [mostrarZonas, setMostrarZonas] = useState(true);
  const [mostrarPinos, setMostrarPinos] = useState(true);
  const [usarTiles, setUsarTiles] = useState(false);
  const [desenhando, setDesenhando] = useState(false);

  // Lido na montagem, antes de qualquer efeito: a camada de navegação limpa a URL no primeiro
  // efeito dela, e a partir daí o texto compartilhado já não estaria mais lá.
  const [textoCompartilhadoInicial, setTextoCompartilhadoInicial] = useState<string | null>(
    () => textoCompartilhado(),
  );

  useEffect(() => {
    carregarBase()
      .then((b) => {
        setBase(b);
        setLocais(carregarLocais());
      })
      .catch((e: Error) => setErro(e.message));

    // Compartilhar um post do Facebook ou do WhatsApp para o aplicativo instalado abre
    // direto o formulário de colar, já preenchido.
    if (textoCompartilhadoInicial) navegar({ vista: 'colar' }, 'empilhar');
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Link de imóvel que não existe nesta base (anúncio colado no celular de outra pessoa,
  // anúncio que saiu do ar): tira o id da URL em vez de deixar a tela em silêncio.
  useEffect(() => {
    if (base && selecionado && !porId.has(selecionado)) navegar({ imovel: null }, 'trocar');
  }, [base, selecionado, porId, navegar]);

  // Chave estável da busca: muda quando os filtros mudam, e não quando alguém favorita um
  // imóvel. É o gatilho para a lista voltar ao topo — favoritar não pode fazer isso.
  const chaveBusca = useMemo(() => filtrosParaUrl(filtros), [filtros]);

  const abrirImovel = useCallback(
    (id: string) => navegar({ imovel: id }, 'empilhar'),
    [navegar],
  );
  const abrirVista = useCallback(
    (vista: Vista) => navegar({ vista }, 'empilhar'),
    [navegar],
  );

  const aoClicarZona = useCallback(
    (bairroId: string) => {
      // Clicar num bairro no mapa não tem desfazer óbvio como um chip tem: vira um passo de
      // volta próprio.
      atualizarFiltros(
        (f) => ({
          ...f,
          bairros: f.bairros.includes(bairroId)
            ? f.bairros.filter((b) => b !== bairroId)
            : [...f.bairros, bairroId],
        }),
        'empilhar',
      );
    },
    [atualizarFiltros],
  );

  const aoDesenhar = useCallback(
    (poligono: [number, number][] | null) => {
      atualizarFiltros((f) => ({ ...f, poligono }), 'empilhar');
      setDesenhando(false);
    },
    [atualizarFiltros],
  );

  const guardarLocais = (novos: Imovel[], abrir?: string) => {
    const todosLocais = [...locais, ...novos];
    setLocais(todosLocais);
    salvarLocais(todosLocais);
    setBase((b) =>
      b ? { ...b, dataset: { ...b.dataset, imoveis: [...b.dataset.imoveis, ...novos] } } : b,
    );
    setTextoCompartilhadoInicial(null);
    // Sai do formulário e abre a ficha no mesmo passo: voltar leva ao mapa, não ao formulário
    // que a pessoa já concluiu.
    navegar({ vista: 'nenhum', imovel: abrir ?? null }, 'trocar');
  };

  const salvarColado = (imovel: Imovel) => guardarLocais([imovel], imovel.id);

  const salvarVariosColados = (imoveis: Imovel[]) => guardarLocais(imoveis);

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
              onClick={() => atualizarFiltros((f) => ({ ...f, finalidade: m }), 'empilhar')}
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
          {/* No celular sobra espaço para o ícone e não para a palavra: os rótulos saem, o
              title e o aria-label continuam dizendo o que cada botão faz. */}
          <button
            className="botao"
            onClick={() => abrirVista('comparar')}
            title="Comparar imóveis"
            aria-label="Comparar imóveis"
          >
            <IconeComparar />
            <span className="rotulo-botao">Comparar</span>
            {comparador.itens.size > 0 && (
              <span className="contador">
                {comparador.itens.size}/{LIMITE_COMPARACAO}
              </span>
            )}
          </button>
          <button
            className="botao"
            onClick={() => abrirVista('mercado')}
            title="Painel de mercado"
            aria-label="Painel de mercado"
          >
            <IconeGrafico />
            <span className="rotulo-botao">Mercado</span>
          </button>
          <button
            className="botao primario"
            onClick={() => abrirVista('colar')}
            title="Colar anúncio de Facebook ou WhatsApp"
            aria-label="Colar anúncio"
          >
            <IconeColar />
            <span className="rotulo-botao">Colar anúncio</span>
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
          chaveBusca={chaveBusca}
          imoveis={filtrados}
          totalNoModo={imoveisDoModo.length}
          estatisticas={estatisticas}
          favoritos={favoritos.itens}
          comparando={comparador.itens}
          destacado={destacado}
          finalidade={filtros.finalidade}
          aoMudarFiltros={atualizarFiltros}
          aoAbrirFiltros={() => abrirVista('filtros')}
          aoAbrir={abrirImovel}
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
            selecionado={selecionado}
            favoritos={favoritos.itens}
            bairrosSelecionados={filtros.bairros}
            poligono={filtros.poligono}
            desenhando={desenhando}
            aoSelecionar={abrirImovel}
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
        <button
          aria-pressed={vistaMobile === 'lista'}
          onClick={() => navegar({ aba: 'lista' }, 'empilhar')}
        >
          Lista
        </button>
        <button
          aria-pressed={vistaMobile === 'mapa'}
          onClick={() => navegar({ aba: 'mapa' }, 'empilhar')}
        >
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
          aoFechar={voltar}
        />
      )}

      {modal === 'filtros' && (
        <ModalFiltros
          filtros={filtros}
          zonas={base.zonas}
          faixaPreco={faixaDePreco(todos, filtros.finalidade)}
          finalidade={filtros.finalidade}
          contar={(f) => aplicarFiltros(todos, f, favoritos.itens).length}
          // Confirmar fecha e aplica no mesmo passo: os filtros escolhidos aqui viajam junto
          // com o voltar, senão cairiam na entrada anterior do histórico — a de antes deles.
          aoAplicar={(f) => voltar({ filtros: f })}
          aoFechar={voltar}
        />
      )}

      {modal === 'comparar' && (
        <Comparador
          imoveis={emComparacao}
          estatisticas={estatisticas}
          aoRemover={comparador.alternar}
          aoLimpar={comparador.limpar}
          aoFechar={voltar}
        />
      )}

      {modal === 'colar' && (
        <ColarAnuncio
          gazetteer={base.gazetteer}
          indiceGeo={base.indiceGeo}
          textoInicial={textoCompartilhadoInicial ?? undefined}
          aoSalvar={salvarColado}
          aoSalvarVarios={salvarVariosColados}
          aoFechar={() => {
            setTextoCompartilhadoInicial(null);
            voltar();
          }}
        />
      )}

      {modal === 'mercado' && (
        <Suspense
          fallback={
            <div className="fundo-modal">
              <div className="carregando">abrindo o painel de mercado…</div>
            </div>
          }
        >
          <PainelMercado
            dataset={base.dataset}
            zonas={base.zonas}
            imoveisDoModo={imoveisDoModo}
            estatisticas={estatisticas}
            finalidade={filtros.finalidade}
            aoFechar={voltar}
          />
        </Suspense>
      )}
    </div>
  );
}
