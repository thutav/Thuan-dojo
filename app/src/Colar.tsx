import { useMemo, useState } from 'react';
import { posicionar, resolverBairro, type IndiceGeo } from '@core/geocode';
import { calcularPrecoM2 } from '@core/normalize';
import { parseAnuncioColado } from '@core/paste';
import { rotuloTipo } from '@core/format';
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

export function ColarAnuncio(props: {
  gazetteer: Gazetteer;
  indiceGeo: IndiceGeo;
  aoSalvar: (imovel: Imovel) => void;
  aoFechar: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [edicao, setEdicao] = useState<Rascunho>({});

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
        <>
          <button className="botao" onClick={() => setTexto(EXEMPLO)}>
            Usar um exemplo
          </button>
          <button className="botao primario" onClick={salvar} disabled={!podeSalvar}>
            Salvar no meu mapa
          </button>
        </>
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

      {lido && (
        <>
          <div className="alerta info" style={{ marginBottom: 14 }}>
            Confira os campos abaixo antes de salvar. O que o parser encontrou sozinho está
            marcado como <em>detectado</em>; o resto você completa. O anúncio fica salvo neste
            navegador e entra nos filtros, no mapa e nas estatísticas.
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
