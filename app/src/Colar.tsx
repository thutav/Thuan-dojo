import { useMemo, useState } from 'react';
import { posicionar, resolverBairro, type IndiceGeo } from '@core/geocode';
import { calcularPrecoM2 } from '@core/normalize';
import { parseAnuncioColado, separarAnuncios } from '@core/paste';
import { formatarPreco, rotuloTipo } from '@core/format';
import type { Finalidade, Gazetteer, Imovel, TipoImovel } from '@core/types';
import { Modal } from './Ficha';

const EXEMPLO = `VENDO CASA NO CURRAL 🏖️
Casa com 3 quartos sendo 2 suítes, 180 m² de área construída em terreno de 450 m².
Piscina, churrasqueira e vista para o mar.
Valor: R$ 1.850.000
Contato (12) 99123-4567`;

/**
 * Grupo de Facebook e WhatsApp não têm API — e raspar essas plataformas violaria os termos
 * delas. O caminho honesto é este: a pessoa cola o texto que já está vendo, o parser separa
 * os campos, ela confere e salva. O anúncio fica no navegador dela e entra nas buscas, nos
 * mapas e nas estatísticas como qualquer outro.
 */
/** O que a pessoa corrigiu à mão. Separado de `Imovel` porque aqui tudo pode estar vazio. */
interface Rascunho {
  titulo?: string;
  finalidade?: Finalidade;
  tipo?: TipoImovel;
  bairroId?: string;
  preco?: number | null;
  areaUtil?: number | null;
  areaTerreno?: number | null;
  quartos?: number | null;
  suites?: number | null;
  banheiros?: number | null;
  vagas?: number | null;
  condominio?: number | null;
  iptu?: number | null;
}

type CampoNumerico = 'preco' | 'areaUtil' | 'areaTerreno' | 'quartos' | 'suites' | 'banheiros' | 'vagas' | 'condominio' | 'iptu';

/** Monta o imóvel a partir de um texto já revisado (ou de um bloco de um lote). */
function montarImovel(
  texto: string,
  bairroId: string,
  gazetteer: Gazetteer,
  indiceGeo: IndiceGeo,
  ajustes: Rascunho = {},
  sufixoId = '',
): Imovel | null {
  const lido = parseAnuncioColado(texto);
  const bairro = gazetteer.bairros.find((b) => b.id === bairroId);
  const preco = ajustes.preco ?? lido.preco;
  if (!bairro || !preco) return null;

  const id = `local-${Date.now().toString(36)}${sufixoId}`;
  const pos = posicionar(id, bairro, indiceGeo);
  const hoje = new Date().toISOString().slice(0, 10);
  const areaUtil = ajustes.areaUtil ?? lido.areaUtil ?? null;

  return {
    id,
    titulo: ajustes.titulo || lido.titulo,
    finalidade: ajustes.finalidade ?? lido.finalidade ?? 'venda',
    tipo: ajustes.tipo ?? lido.tipo ?? 'casa',
    bairroId: pos.bairroId,
    bairro: pos.bairro,
    setor: pos.setor,
    preco,
    precoM2: calcularPrecoM2(preco, areaUtil),
    condominio: ajustes.condominio ?? lido.condominio ?? null,
    iptu: ajustes.iptu ?? lido.iptu ?? null,
    areaUtil,
    areaTerreno: ajustes.areaTerreno ?? lido.areaTerreno ?? null,
    quartos: ajustes.quartos ?? lido.quartos ?? null,
    suites: ajustes.suites ?? lido.suites ?? null,
    banheiros: ajustes.banheiros ?? lido.banheiros ?? null,
    vagas: ajustes.vagas ?? lido.vagas ?? null,
    caracteristicas: lido.caracteristicas,
    descricao: texto.trim(),
    fotos: [],
    lat: pos.lat,
    lon: pos.lon,
    precisaoGeo: pos.precisao,
    fontes: lido.telefone
      ? [
          {
            fonte: 'colado',
            nomeFonte: `Colado por você · ${lido.telefone}`,
            url: '',
            preco,
            coletadoEm: hoje,
          },
        ]
      : [],
    atualizadoEm: hoje,
    novo: true,
  };
}

export function ColarAnuncio(props: {
  gazetteer: Gazetteer;
  indiceGeo: IndiceGeo;
  textoInicial?: string;
  aoSalvar: (imovel: Imovel) => void;
  aoSalvarVarios?: (imoveis: Imovel[]) => void;
  aoFechar: () => void;
}) {
  const [texto, setTexto] = useState(props.textoInicial ?? '');
  const [edicao, setEdicao] = useState<Rascunho>({});
  const [bairroDoLote, setBairroDoLote] = useState<Record<number, string>>({});

  // Um post só segue no formulário detalhado; vários viram uma lista para confirmar de uma vez.
  const blocos = useMemo(() => (texto.trim() ? separarAnuncios(texto) : []), [texto]);
  const ehLote = blocos.length > 1;

  const lote = useMemo(
    () =>
      blocos.map((bloco, i) => {
        const parsed = parseAnuncioColado(bloco);
        const bairro = resolverBairro(bloco, props.indiceGeo);
        return { i, bloco, parsed, bairroId: bairroDoLote[i] ?? bairro?.id ?? '' };
      }),
    [blocos, bairroDoLote, props.indiceGeo],
  );

  const lido = useMemo(() => (texto.trim() ? parseAnuncioColado(texto) : null), [texto]);
  const bairroDetectado = useMemo(
    () => (texto.trim() ? resolverBairro(texto, props.indiceGeo) : null),
    [texto, props.indiceGeo],
  );

  /** Valor corrigido à mão vence; senão vale o que o parser leu; senão, vazio. */
  const campo = (chave: CampoNumerico): number | null =>
    edicao[chave] ?? (lido?.[chave] as number | null | undefined) ?? null;

  const definir = (chave: CampoNumerico) => (valor: string) =>
    setEdicao((s) => ({ ...s, [chave]: valor === '' ? null : Number(valor) }));

  const bairroId = edicao.bairroId ?? bairroDetectado?.id ?? '';
  const detectado = (nome: string) =>
    lido?.camposDetectados.includes(nome) && edicao[nome as keyof Rascunho] === undefined;

  const finalidade = edicao.finalidade ?? lido?.finalidade ?? 'venda';
  const tipo = edicao.tipo ?? lido?.tipo ?? 'casa';
  const preco = campo('preco');
  const areaUtil = campo('areaUtil');
  const podeSalvar = !!texto.trim() && !!bairroId && !!preco && preco > 0;

  const salvarLote = () => {
    const prontos = lote
      .map((item, ordem) =>
        item.bairroId
          ? montarImovel(item.bloco, item.bairroId, props.gazetteer, props.indiceGeo, {}, `-${ordem}`)
          : null,
      )
      .filter((i): i is Imovel => i !== null);
    if (prontos.length) props.aoSalvarVarios?.(prontos);
  };

  const salvar = () => {
    const bairro = props.gazetteer.bairros.find((b) => b.id === bairroId);
    if (!bairro || !lido || !preco) return;

    const id = `local-${Date.now().toString(36)}`;
    const pos = posicionar(id, bairro, props.indiceGeo);
    const hoje = new Date().toISOString().slice(0, 10);

    const imovel: Imovel = {
      id,
      titulo: edicao.titulo || lido.titulo,
      finalidade,
      tipo,
      bairroId: pos.bairroId,
      bairro: pos.bairro,
      setor: pos.setor,
      preco,
      precoM2: calcularPrecoM2(preco, areaUtil),
      condominio: campo('condominio'),
      iptu: campo('iptu'),
      areaUtil,
      areaTerreno: campo('areaTerreno'),
      quartos: campo('quartos'),
      suites: campo('suites'),
      banheiros: campo('banheiros'),
      vagas: campo('vagas'),
      caracteristicas: lido.caracteristicas,
      descricao: texto.trim(),
      fotos: [],
      lat: pos.lat,
      lon: pos.lon,
      precisaoGeo: pos.precisao,
      fontes: lido.telefone
        ? [
            {
              fonte: 'colado',
              nomeFonte: `Colado por você · ${lido.telefone}`,
              url: '',
              preco,
              coletadoEm: hoje,
            },
          ]
        : [],
      atualizadoEm: hoje,
      novo: true,
    };
    props.aoSalvar(imovel);
  };

  return (
    <Modal
      titulo="Colar anúncio"
      subtitulo="Cole o texto de um post de Facebook, WhatsApp ou de um anúncio avulso"
      aoFechar={props.aoFechar}
      rodape={
        ehLote ? (
          <>
            <span style={{ marginRight: 'auto', fontSize: 12.5, color: 'var(--muted)' }}>
              {lote.filter((l) => l.bairroId).length} de {lote.length} prontos para salvar
            </span>
            <button
              className="botao primario"
              onClick={salvarLote}
              disabled={!lote.some((l) => l.bairroId)}
            >
              Salvar {lote.filter((l) => l.bairroId).length} anúncios
            </button>
          </>
        ) : (
          <>
            <button className="botao" onClick={() => setTexto(EXEMPLO)}>
              Usar um exemplo
            </button>
            <button className="botao primario" onClick={salvar} disabled={!podeSalvar}>
              Salvar no meu mapa
            </button>
          </>
        )
      }
    >
      <div className="campo">
        <label htmlFor="texto-anuncio">Texto do anúncio</label>
        <textarea
          id="texto-anuncio"
          value={texto}
          placeholder="Cole aqui o texto do anúncio…"
          onChange={(e) => setTexto(e.target.value)}
        />
      </div>

      {ehLote && (
        <>
          <div className="alerta info" style={{ marginBottom: 14 }}>
            <span>
              <strong>{lote.length} anúncios</strong> reconhecidos no texto colado. Confira o
              bairro de cada um — os que ficarem sem bairro não são salvos, porque não teriam
              onde aparecer no mapa.
            </span>
          </div>

          <div className="lista-lote">
            {lote.map((item) => (
              <div className="item-lote" key={item.i}>
                <div style={{ minWidth: 0 }}>
                  <div className="titulo-lote">{item.parsed.titulo}</div>
                  <div className="mono" style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                    {item.parsed.preco
                      ? formatarPreco(item.parsed.preco, item.parsed.finalidade ?? 'venda')
                      : 'sem preço'}
                    {item.parsed.areaUtil ? ` · ${item.parsed.areaUtil} m²` : ''}
                    {item.parsed.quartos ? ` · ${item.parsed.quartos} quartos` : ''}
                  </div>
                </div>
                <select
                  value={item.bairroId}
                  aria-label={`Bairro do anúncio ${item.i + 1}`}
                  onChange={(e) => setBairroDoLote((s) => ({ ...s, [item.i]: e.target.value }))}
                >
                  <option value="">sem bairro</option>
                  {props.gazetteer.bairros.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nome}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </>
      )}

      {lido && !ehLote && (
        <>
          <div className="alerta info" style={{ marginBottom: 14 }}>
            <span>
              Confira os campos abaixo antes de salvar. O que o parser encontrou sozinho está
              marcado como <em>detectado</em>; o resto você completa. O anúncio fica salvo neste
              navegador e entra nos filtros, no mapa e nas estatísticas.
            </span>
          </div>

          <div className="grade-campos">
            <div className={`campo${detectado('finalidade') ? ' detectado' : ''}`}>
              <label htmlFor="f-finalidade">Finalidade</label>
              <select
                id="f-finalidade"
                value={finalidade}
                onChange={(e) => setEdicao((s) => ({ ...s, finalidade: e.target.value as Finalidade }))}
              >
                <option value="venda">Venda</option>
                <option value="aluguel">Aluguel mensal</option>
                <option value="temporada">Temporada (diária)</option>
              </select>
            </div>

            <div className={`campo${detectado('tipo') ? ' detectado' : ''}`}>
              <label htmlFor="f-tipo">Tipo</label>
              <select
                id="f-tipo"
                value={tipo}
                onChange={(e) => setEdicao((s) => ({ ...s, tipo: e.target.value as TipoImovel }))}
              >
                {(['casa', 'apartamento', 'terreno', 'comercial', 'pousada'] as TipoImovel[]).map(
                  (t) => (
                    <option key={t} value={t}>
                      {rotuloTipo(t)}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className={`campo${bairroDetectado && !edicao.bairroId ? ' detectado' : ''}`}>
              <label htmlFor="f-bairro">Bairro</label>
              <select
                id="f-bairro"
                value={bairroId}
                onChange={(e) => setEdicao((s) => ({ ...s, bairroId: e.target.value }))}
              >
                <option value="">selecione…</option>
                {props.gazetteer.bairros.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className={`campo${detectado('preco') ? ' detectado' : ''}`}>
              <label htmlFor="f-preco">
                {finalidade === 'venda' ? 'Preço' : finalidade === 'aluguel' ? 'Aluguel mensal' : 'Diária'}
              </label>
              <input
                id="f-preco"
                type="number"
                value={preco ?? ''}
                onChange={(e) => definir('preco')(e.target.value)}
              />
            </div>

            <div className={`campo${detectado('areaUtil') ? ' detectado' : ''}`}>
              <label htmlFor="f-area">Área construída (m²)</label>
              <input
                id="f-area"
                type="number"
                value={areaUtil ?? ''}
                onChange={(e) => definir('areaUtil')(e.target.value)}
              />
            </div>

            <div className={`campo${detectado('areaTerreno') ? ' detectado' : ''}`}>
              <label htmlFor="f-terreno">Terreno (m²)</label>
              <input
                id="f-terreno"
                type="number"
                value={campo('areaTerreno') ?? ''}
                onChange={(e) => definir('areaTerreno')(e.target.value)}
              />
            </div>

            <div className={`campo${detectado('quartos') ? ' detectado' : ''}`}>
              <label htmlFor="f-quartos">Quartos</label>
              <input
                id="f-quartos"
                type="number"
                value={campo('quartos') ?? ''}
                onChange={(e) => definir('quartos')(e.target.value)}
              />
            </div>

            <div className={`campo${detectado('suites') ? ' detectado' : ''}`}>
              <label htmlFor="f-suites">Suítes</label>
              <input
                id="f-suites"
                type="number"
                value={campo('suites') ?? ''}
                onChange={(e) => definir('suites')(e.target.value)}
              />
            </div>

            <div className={`campo${detectado('vagas') ? ' detectado' : ''}`}>
              <label htmlFor="f-vagas">Vagas</label>
              <input
                id="f-vagas"
                type="number"
                value={campo('vagas') ?? ''}
                onChange={(e) => definir('vagas')(e.target.value)}
              />
            </div>
          </div>

          {lido.caracteristicas.length > 0 && (
            <div className="chips" style={{ marginTop: 6 }}>
              {lido.caracteristicas.map((c) => (
                <span key={c} className="chip" aria-pressed>
                  {c}
                </span>
              ))}
            </div>
          )}

          {!bairroId && (
            <div className="alerta atencao" style={{ marginTop: 14 }}>
              Escolha o bairro para o imóvel poder aparecer no mapa.
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
