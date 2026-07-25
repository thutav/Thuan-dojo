import { formatarPreco, rotuloCaracteristica, rotuloTipo } from '@core/format';
import type { Caracteristica, Finalidade, Setor, TipoImovel, Zona } from '@core/types';
import { FILTROS_PADRAO, type Filtros } from './dados';
import { Modal } from './Ficha';

const TODOS_TIPOS: TipoImovel[] = ['casa', 'apartamento', 'terreno', 'comercial', 'pousada'];

const TODAS_CARACTERISTICAS: Caracteristica[] = [
  'vista-mar',
  'pe-na-areia',
  'piscina',
  'condominio-fechado',
  'mobiliado',
  'aceita-pet',
  'churrasqueira',
  'ar-condicionado',
  'vaga-barco',
  'area-gourmet',
];

const SETORES: { id: Setor; rotulo: string }[] = [
  { id: 'norte', rotulo: 'Norte' },
  { id: 'centro', rotulo: 'Centro' },
  { id: 'sul', rotulo: 'Sul' },
  { id: 'leste', rotulo: 'Leste (Castelhanos)' },
  { id: 'costeira-sul', rotulo: 'Costeira sul' },
];

function CampoNumero(props: {
  rotulo: string;
  valor: number | null;
  sufixo?: string;
  passo?: number;
  aoMudar: (v: number | null) => void;
}) {
  return (
    <div className="campo">
      <label htmlFor={`campo-${props.rotulo}`}>
        {props.rotulo}
        {props.sufixo ? ` (${props.sufixo})` : ''}
      </label>
      <input
        id={`campo-${props.rotulo}`}
        type="number"
        inputMode="numeric"
        min={0}
        step={props.passo ?? 1}
        value={props.valor ?? ''}
        placeholder="—"
        onChange={(e) => props.aoMudar(e.target.value === '' ? null : Number(e.target.value))}
      />
    </div>
  );
}

export function ModalFiltros(props: {
  filtros: Filtros;
  zonas: Zona[];
  faixaPreco: [number, number];
  finalidade: Finalidade;
  aoMudar: (atualizar: (f: Filtros) => Filtros) => void;
  aoFechar: () => void;
}) {
  const { filtros, zonas, faixaPreco, finalidade } = props;

  const alternarEmLista = <T extends string>(lista: T[], item: T): T[] =>
    lista.includes(item) ? lista.filter((x) => x !== item) : [...lista, item];

  const passoPreco = finalidade === 'venda' ? 50_000 : finalidade === 'aluguel' ? 500 : 50;

  return (
    <Modal
      titulo="Filtros"
      subtitulo={`Faixa nos dados: ${formatarPreco(faixaPreco[0], finalidade)} a ${formatarPreco(faixaPreco[1], finalidade)}`}
      aoFechar={props.aoFechar}
      rodape={
        <>
          <button
            className="botao"
            onClick={() =>
              props.aoMudar((f) => ({
                ...FILTROS_PADRAO,
                finalidade: f.finalidade,
                ordenacao: f.ordenacao,
                texto: f.texto,
              }))
            }
          >
            Limpar tudo
          </button>
          <button className="botao primario" onClick={props.aoFechar}>
            Ver resultados
          </button>
        </>
      }
    >
      <div className="bloco" style={{ marginBottom: 14 }}>
        <h3>Preço</h3>
        <div className="grade-campos">
          <CampoNumero
            rotulo="Mínimo"
            valor={filtros.precoMin}
            passo={passoPreco}
            aoMudar={(v) => props.aoMudar((f) => ({ ...f, precoMin: v }))}
          />
          <CampoNumero
            rotulo="Máximo"
            valor={filtros.precoMax}
            passo={passoPreco}
            aoMudar={(v) => props.aoMudar((f) => ({ ...f, precoMax: v }))}
          />
        </div>
      </div>

      <div className="bloco" style={{ marginBottom: 14 }}>
        <h3>Tamanho</h3>
        <div className="grade-campos">
          <CampoNumero
            rotulo="Área mínima"
            sufixo="m²"
            valor={filtros.areaMin}
            passo={10}
            aoMudar={(v) => props.aoMudar((f) => ({ ...f, areaMin: v }))}
          />
          <CampoNumero
            rotulo="Área máxima"
            sufixo="m²"
            valor={filtros.areaMax}
            passo={10}
            aoMudar={(v) => props.aoMudar((f) => ({ ...f, areaMax: v }))}
          />
          <CampoNumero
            rotulo="Quartos"
            sufixo="mín."
            valor={filtros.quartosMin}
            aoMudar={(v) => props.aoMudar((f) => ({ ...f, quartosMin: v }))}
          />
          <CampoNumero
            rotulo="Suítes"
            sufixo="mín."
            valor={filtros.suitesMin}
            aoMudar={(v) => props.aoMudar((f) => ({ ...f, suitesMin: v }))}
          />
          <CampoNumero
            rotulo="Vagas"
            sufixo="mín."
            valor={filtros.vagasMin}
            aoMudar={(v) => props.aoMudar((f) => ({ ...f, vagasMin: v }))}
          />
        </div>
      </div>

      <div className="bloco" style={{ marginBottom: 14 }}>
        <h3>Tipo de imóvel</h3>
        <div className="chips">
          {TODOS_TIPOS.map((t) => (
            <button
              key={t}
              className="chip"
              aria-pressed={filtros.tipos.includes(t)}
              onClick={() => props.aoMudar((f) => ({ ...f, tipos: alternarEmLista(f.tipos, t) }))}
            >
              {rotuloTipo(t)}
            </button>
          ))}
        </div>
      </div>

      <div className="bloco" style={{ marginBottom: 14 }}>
        <h3>Características</h3>
        <div className="chips">
          {TODAS_CARACTERISTICAS.map((c) => (
            <button
              key={c}
              className="chip"
              aria-pressed={filtros.caracteristicas.includes(c)}
              onClick={() =>
                props.aoMudar((f) => ({
                  ...f,
                  caracteristicas: alternarEmLista(f.caracteristicas, c),
                }))
              }
            >
              {rotuloCaracteristica(c)}
            </button>
          ))}
        </div>
      </div>

      <div className="bloco" style={{ marginBottom: 14 }}>
        <h3>Região da ilha</h3>
        <div className="chips">
          {SETORES.map((s) => (
            <button
              key={s.id}
              className="chip"
              aria-pressed={filtros.setores.includes(s.id)}
              onClick={() => props.aoMudar((f) => ({ ...f, setores: alternarEmLista(f.setores, s.id) }))}
            >
              {s.rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="bloco" style={{ marginBottom: 14 }}>
        <h3>Bairro ou praia</h3>
        <div className="chips">
          {zonas.map((z) => (
            <button
              key={z.id}
              className="chip"
              aria-pressed={filtros.bairros.includes(z.id)}
              onClick={() => props.aoMudar((f) => ({ ...f, bairros: alternarEmLista(f.bairros, z.id) }))}
            >
              {z.nome}
            </button>
          ))}
        </div>
      </div>

      <div className="bloco">
        <h3>Outros</h3>
        <div className="chips">
          <button
            className="chip"
            aria-pressed={filtros.somenteFavoritos}
            onClick={() => props.aoMudar((f) => ({ ...f, somenteFavoritos: !f.somenteFavoritos }))}
          >
            Somente favoritos
          </button>
          <button
            className="chip"
            aria-pressed={filtros.somenteComFoto}
            onClick={() => props.aoMudar((f) => ({ ...f, somenteComFoto: !f.somenteComFoto }))}
          >
            Somente com foto
          </button>
          {filtros.poligono && (
            <button
              className="chip"
              aria-pressed
              onClick={() => props.aoMudar((f) => ({ ...f, poligono: null }))}
            >
              Área desenhada · remover
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
