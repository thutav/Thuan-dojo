import { useEffect, useRef } from 'react';
import type { EstatisticaZona } from '@core/stats';
import { dealScore } from '@core/stats';
import {
  formatarArea,
  formatarData,
  formatarNumero,
  formatarPreco,
  formatarPrecoCompleto,
  formatarPrecoM2,
  rotuloCaracteristica,
  rotuloTipo,
} from '@core/format';
import type { Imovel } from '@core/types';
import { IconeAlerta, IconeComparar, IconeCoracao, IconeFechar, IconeLink } from './icones';

/** Fecha no Esc e devolve o foco a quem abriu — o modal é usado no teclado o tempo todo. */
export function Modal(props: {
  titulo: string;
  subtitulo?: string;
  largo?: boolean;
  aoFechar: () => void;
  children: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  const caixaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    caixaRef.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.aoFechar();
    };
    addEventListener('keydown', aoTeclar);
    return () => {
      removeEventListener('keydown', aoTeclar);
      anterior?.focus?.();
    };
  }, [props]);

  return (
    <div
      className="fundo-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.aoFechar();
      }}
    >
      <div
        className={`modal${props.largo ? '' : ' estreito'}`}
        role="dialog"
        aria-modal="true"
        aria-label={props.titulo}
        tabIndex={-1}
        ref={caixaRef}
      >
        <header className="cabecalho-modal">
          <div>
            <h2>{props.titulo}</h2>
            {props.subtitulo && <div className="sub">{props.subtitulo}</div>}
          </div>
          <button className="fechar" onClick={props.aoFechar} aria-label="Fechar">
            <IconeFechar />
          </button>
        </header>
        <div className="conteudo-modal">{props.children}</div>
        {props.rodape && <footer className="rodape-modal">{props.rodape}</footer>}
      </div>
    </div>
  );
}

export function FichaImovel(props: {
  imovel: Imovel;
  estatisticas: Map<string, EstatisticaZona>;
  favorito: boolean;
  comparando: boolean;
  aoFavoritar: (id: string) => void;
  aoComparar: (id: string) => void;
  aoFechar: () => void;
}) {
  const { imovel, estatisticas } = props;
  const score = dealScore(imovel, estatisticas);
  const est = estatisticas.get(imovel.bairroId);
  const menorPreco = Math.min(...imovel.fontes.map((f) => f.preco).filter((p) => p > 0), imovel.preco);

  // Posição do imóvel dentro da faixa do bairro, para a barra comparativa.
  let posicaoNaFaixa: number | null = null;
  if (imovel.precoM2 && est?.confiavel && est.q1PrecoM2 && est.q3PrecoM2) {
    const min = Math.min(est.q1PrecoM2, imovel.precoM2);
    const max = Math.max(est.q3PrecoM2, imovel.precoM2);
    posicaoNaFaixa = max > min ? ((imovel.precoM2 - min) / (max - min)) * 100 : 50;
  }

  return (
    <Modal
      largo
      titulo={imovel.titulo}
      subtitulo={`${rotuloTipo(imovel.tipo)} em ${imovel.bairro} · atualizado em ${formatarData(imovel.atualizadoEm)}`}
      aoFechar={props.aoFechar}
      rodape={
        <>
          <button
            className="botao"
            aria-pressed={props.favorito}
            onClick={() => props.aoFavoritar(imovel.id)}
          >
            <IconeCoracao preenchido={props.favorito} />
            {props.favorito ? 'Nos favoritos' : 'Salvar'}
          </button>
          <button
            className="botao"
            aria-pressed={props.comparando}
            onClick={() => props.aoComparar(imovel.id)}
          >
            <IconeComparar />
            {props.comparando ? 'Na comparação' : 'Comparar'}
          </button>
          {imovel.fontes[0]?.url && !imovel.fontes[0].url.startsWith('#') && (
            <a
              className="botao primario"
              href={imovel.fontes[0].url}
              target="_blank"
              rel="noreferrer noopener"
            >
              <IconeLink />
              Ver anúncio original
            </a>
          )}
        </>
      }
    >
      <div className="ficha">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {imovel.demo && (
            <div className="alerta atencao">
              <IconeAlerta />
              <span>
                <strong>Registro de demonstração.</strong> Os valores são sintéticos, gerados para
                você conferir o aplicativo antes da primeira coleta. Não use como referência de
                mercado.
              </span>
            </div>
          )}

          {imovel.divergenciaFontes && (
            <div className="alerta atencao">
              <IconeAlerta />
              <span>
                As fontes divergem em mais de 15% no preço deste imóvel. Confirme o valor antes de
                negociar — pode ser anúncio desatualizado em uma delas.
              </span>
            </div>
          )}

          <div className="bloco">
            <h3>Preço</h3>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 30 }}>
                {formatarPrecoCompleto(menorPreco, imovel.finalidade)}
              </div>
              {imovel.precoM2 && (
                <div className="mono" style={{ color: 'var(--muted)' }}>
                  {formatarPrecoM2(imovel.precoM2, imovel.finalidade)}
                </div>
              )}
            </div>

            {score ? (
              <>
                <div className="barra-comparativa" aria-hidden="true">
                  <i style={{ width: `${Math.max(3, Math.min(100, posicaoNaFaixa ?? 50))}%` }} />
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                  {score.rotulo} — a mediana em {imovel.bairro} é{' '}
                  <span className="mono">
                    {formatarPrecoM2(score.medianaZona, imovel.finalidade)}
                  </span>{' '}
                  ({est?.nComArea} anúncios com área informada)
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8 }}>
                {imovel.precoM2
                  ? `Sem comparação: ${imovel.bairro} ainda não tem anúncios suficientes para uma mediana confiável.`
                  : 'Sem comparação: o anúncio não informa a área.'}
              </div>
            )}

            {(imovel.condominio || imovel.iptu) && (
              <div className="mono" style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
                {imovel.condominio ? `condomínio ${formatarPreco(imovel.condominio, 'aluguel')}` : ''}
                {imovel.condominio && imovel.iptu ? ' · ' : ''}
                {imovel.iptu ? `IPTU R$ ${formatarNumero(imovel.iptu)}/ano` : ''}
              </div>
            )}
          </div>

          <div className="bloco">
            <h3>Características</h3>
            <div className="grade-specs">
              <div className="spec">
                <div className="valor">{formatarArea(imovel.areaUtil)}</div>
                <div className="rotulo">área construída</div>
              </div>
              <div className="spec">
                <div className="valor">{formatarArea(imovel.areaTerreno)}</div>
                <div className="rotulo">terreno</div>
              </div>
              <div className="spec">
                <div className="valor">{formatarNumero(imovel.quartos)}</div>
                <div className="rotulo">quartos</div>
              </div>
              <div className="spec">
                <div className="valor">{formatarNumero(imovel.suites)}</div>
                <div className="rotulo">suítes</div>
              </div>
              <div className="spec">
                <div className="valor">{formatarNumero(imovel.banheiros)}</div>
                <div className="rotulo">banheiros</div>
              </div>
              <div className="spec">
                <div className="valor">{formatarNumero(imovel.vagas)}</div>
                <div className="rotulo">vagas</div>
              </div>
            </div>

            {imovel.caracteristicas.length > 0 && (
              <div className="chips" style={{ marginTop: 13 }}>
                {imovel.caracteristicas.map((c) => (
                  <span key={c} className="chip" aria-pressed={false}>
                    {rotuloCaracteristica(c)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {imovel.descricao && (
            <div className="bloco">
              <h3>Descrição</h3>
              <p style={{ fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                {imovel.descricao}
              </p>
            </div>
          )}
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="bloco">
            <h3>
              {imovel.fontes.length > 1
                ? `Anunciado em ${imovel.fontes.length} lugares`
                : 'Onde está anunciado'}
            </h3>
            <div className="lista-fontes">
              {imovel.fontes.map((f) => (
                <div className="fonte-item" key={f.url + f.fonte}>
                  <div style={{ minWidth: 0 }}>
                    {f.url && !f.url.startsWith('#') ? (
                      <a href={f.url} target="_blank" rel="noreferrer noopener">
                        {f.nomeFonte}
                      </a>
                    ) : (
                      <span>{f.nomeFonte}</span>
                    )}
                    {f.codigo && (
                      <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                        cód. {f.codigo}
                      </div>
                    )}
                  </div>
                  <div
                    className={`valor-fonte${f.preco === menorPreco && imovel.fontes.length > 1 ? ' menor' : ''}`}
                  >
                    {formatarPreco(f.preco, imovel.finalidade)}
                  </div>
                </div>
              ))}
              {imovel.fontes.length === 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                  Anúncio adicionado por você neste navegador.
                </div>
              )}
            </div>
          </div>

          <div className="bloco">
            <h3>Localização</h3>
            <div style={{ fontSize: 13 }}>{imovel.bairro}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              {imovel.precisaoGeo === 'exata'
                ? 'Coordenada informada pelo anúncio.'
                : 'Posição aproximada: o anúncio informa o bairro, não o endereço. O pino fica dentro do bairro, sem apontar a casa.'}
            </div>
            {est && (
              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: '4px 10px',
                  marginTop: 11,
                  fontSize: 12,
                }}
              >
                <dt style={{ color: 'var(--muted)' }}>Ofertas no bairro</dt>
                <dd className="mono" style={{ textAlign: 'right' }}>
                  {est.n}
                </dd>
                {est.confiavel && est.medianaPrecoM2 && (
                  <>
                    <dt style={{ color: 'var(--muted)' }}>Mediana por m²</dt>
                    <dd className="mono" style={{ textAlign: 'right' }}>
                      {formatarPrecoM2(est.medianaPrecoM2, imovel.finalidade)}
                    </dd>
                  </>
                )}
              </dl>
            )}
          </div>

          {imovel.variacaoPreco && (
            <div className="bloco">
              <h3>Histórico</h3>
              <div style={{ fontSize: 13 }}>
                {imovel.variacaoPreco.pct < 0 ? 'Baixou ' : 'Subiu '}
                <strong className="mono">
                  {Math.abs(Math.round(imovel.variacaoPreco.pct * 100))}%
                </strong>{' '}
                desde {formatarData(imovel.variacaoPreco.desde)}.
              </div>
            </div>
          )}
        </aside>
      </div>
    </Modal>
  );
}

export function Comparador(props: {
  imoveis: Imovel[];
  estatisticas: Map<string, EstatisticaZona>;
  aoRemover: (id: string) => void;
  aoLimpar: () => void;
  aoFechar: () => void;
}) {
  const { imoveis, estatisticas } = props;

  const linhas: { rotulo: string; valor: (i: Imovel) => string; melhor?: 'menor' | 'maior' }[] = [
    { rotulo: 'Preço', valor: (i) => formatarPreco(i.preco, i.finalidade), melhor: 'menor' },
    {
      rotulo: 'Preço por m²',
      valor: (i) => formatarPrecoM2(i.precoM2, i.finalidade),
      melhor: 'menor',
    },
    { rotulo: 'Bairro', valor: (i) => i.bairro },
    { rotulo: 'Tipo', valor: (i) => rotuloTipo(i.tipo) },
    { rotulo: 'Área construída', valor: (i) => formatarArea(i.areaUtil), melhor: 'maior' },
    { rotulo: 'Terreno', valor: (i) => formatarArea(i.areaTerreno), melhor: 'maior' },
    { rotulo: 'Quartos', valor: (i) => formatarNumero(i.quartos), melhor: 'maior' },
    { rotulo: 'Suítes', valor: (i) => formatarNumero(i.suites), melhor: 'maior' },
    { rotulo: 'Vagas', valor: (i) => formatarNumero(i.vagas), melhor: 'maior' },
    {
      rotulo: 'Contra o bairro',
      valor: (i) => dealScore(i, estatisticas)?.rotulo ?? 'sem amostra',
    },
    {
      rotulo: 'Características',
      valor: (i) => i.caracteristicas.map(rotuloCaracteristica).join(', ') || '—',
    },
    { rotulo: 'Anúncios', valor: (i) => String(i.fontes.length || 1) },
  ];

  const numeroDe = (i: Imovel, rotulo: string): number | null => {
    switch (rotulo) {
      case 'Preço':
        return i.preco;
      case 'Preço por m²':
        return i.precoM2;
      case 'Área construída':
        return i.areaUtil;
      case 'Terreno':
        return i.areaTerreno;
      case 'Quartos':
        return i.quartos;
      case 'Suítes':
        return i.suites;
      case 'Vagas':
        return i.vagas;
      default:
        return null;
    }
  };

  return (
    <Modal
      largo
      titulo="Comparar imóveis"
      subtitulo={`${imoveis.length} de 4 · o melhor valor de cada linha aparece destacado`}
      aoFechar={props.aoFechar}
      rodape={
        <button className="botao" onClick={props.aoLimpar}>
          Limpar comparação
        </button>
      }
    >
      {imoveis.length === 0 ? (
        <p className="vazio">
          Nada para comparar ainda.
          <br />
          Use o botão de comparar nos cards para juntar até quatro imóveis lado a lado.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="tabela-comparacao">
            <thead>
              <tr>
                <th />
                {imoveis.map((i) => (
                  <th key={i.id} style={{ color: 'var(--text)', width: 'auto' }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{i.titulo}</div>
                    <button
                      className="chip"
                      style={{ marginTop: 6 }}
                      onClick={() => props.aoRemover(i.id)}
                    >
                      remover
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => {
                const numeros = imoveis
                  .map((i) => numeroDe(i, linha.rotulo))
                  .filter((n): n is number => n !== null);
                const alvo =
                  linha.melhor && numeros.length > 1
                    ? linha.melhor === 'menor'
                      ? Math.min(...numeros)
                      : Math.max(...numeros)
                    : null;
                return (
                  <tr key={linha.rotulo}>
                    <th>{linha.rotulo}</th>
                    {imoveis.map((i) => {
                      const n = numeroDe(i, linha.rotulo);
                      const destaque = alvo !== null && n === alvo;
                      return (
                        <td key={i.id} className={destaque ? 'melhor' : undefined}>
                          {linha.valor(i)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
