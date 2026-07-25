import type { AnuncioBruto, Caracteristica, Finalidade, TipoImovel } from './types';
import {
  PADROES,
  detectCaracteristicas,
  detectFinalidade,
  detectTipo,
  parseArea,
  parsePreco,
  parseQuantidade,
  ROTULO_CONSTRUIDO,
  ROTULO_TERRENO,
  acharAreaRotulada,
} from './normalize';
import { normalizar } from './texto';

/**
 * Anúncio de grupo de Facebook e de WhatsApp não tem API nem HTML: tem texto corrido escrito
 * por gente. Este parser lê esse texto e devolve os campos já separados, para a pessoa
 * conferir antes de salvar — nada entra no dataset sem revisão.
 */
export interface AnuncioColado extends AnuncioBruto {
  telefone: string | null;
  condominio: number | null;
  iptu: number | null;
  areaUtil: number | null;
  areaTerreno: number | null;
  caracteristicas: Caracteristica[];
  /** Campos que o parser preencheu sozinho — a interface destaca para revisão. */
  camposDetectados: string[];
}

interface ValorComContexto {
  valor: number;
  /** Trecho antes e depois do valor — usado para escolher o preço principal. */
  contexto: string;
  antes: string;
  depois: string;
  indice: number;
}

const RE_DINHEIRO = /r\$\s*([\d.,]+)\s*(milhoes|milhao|mi\b|mil\b|k\b)?/g;

/**
 * A classificação é feita linha a linha porque é assim que os anúncios são escritos: um
 * valor por linha, com o rótulo ao lado. Olhar o texto como um blocão só faria o "IPTU" da
 * linha seguinte roubar o preço da linha anterior.
 */
function extrairValores(texto: string): ValorComContexto[] {
  const achados: ValorComContexto[] = [];
  let deslocamento = 0;
  for (const linhaBruta of texto.split('\n')) {
    const linha = normalizar(linhaBruta);
    for (const m of linha.matchAll(RE_DINHEIRO)) {
      const valor = parsePreco(m[0]);
      if (valor === null) continue;
      const fim = m.index + m[0].length;
      achados.push({
        valor,
        antes: linha.slice(Math.max(0, m.index - 45), m.index),
        depois: linha.slice(fim, Math.min(linha.length, fim + 24)),
        contexto: linha,
        indice: deslocamento + m.index,
      });
    }
    deslocamento += linhaBruta.length + 1;
  }
  return achados;
}

type Rotulo = 'condominio' | 'iptu' | 'taxa';

const ROTULOS: [Rotulo, RegExp][] = [
  ['condominio', /condominio/g],
  ['iptu', /iptu/g],
  ['taxa', /(taxa|limpeza|caucao|deposito)/g],
];

/**
 * "aluguel R$ 3.200 por mês + condomínio R$ 650": o rótulo que vale para cada valor é o mais
 * próximo dele, não qualquer um que apareça na vizinhança. Rótulo colado depois do valor
 * ("R$ 650 de condomínio") tem prioridade; senão vale o último rótulo antes do valor.
 */
function rotuloDoValor(v: ValorComContexto): Rotulo | null {
  // Rótulo colado logo depois do valor, ligado por conectivo: "R$ 650 de condomínio".
  for (const [nome, re] of ROTULOS) {
    if (new RegExp(`^[\\s,/-]*(?:de |do |da |por |em )?${re.source}`).test(v.depois)) return nome;
  }
  const janela = v.antes.slice(-26);
  let melhor: { nome: Rotulo; pos: number } | null = null;
  for (const [nome, re] of ROTULOS) {
    let m: RegExpExecArray | null;
    const rx = new RegExp(re.source, 'g');
    let ultima = -1;
    while ((m = rx.exec(janela)) !== null) ultima = m.index;
    if (ultima >= 0 && (!melhor || ultima > melhor.pos)) melhor = { nome, pos: ultima };
  }
  return melhor?.nome ?? null;
}

function classificarValores(valores: ValorComContexto[], finalidade: Finalidade | null) {
  let condominio: number | null = null;
  let iptu: number | null = null;
  const candidatos: ValorComContexto[] = [];

  for (const v of valores) {
    const rotulo = rotuloDoValor(v);
    if (rotulo === 'condominio') {
      condominio ??= v.valor;
      continue;
    }
    if (rotulo === 'iptu') {
      iptu ??= v.valor;
      continue;
    }
    if (rotulo === 'taxa') continue;
    candidatos.push(v);
  }

  let preco: number | null = null;
  if (candidatos.length) {
    if (finalidade === 'temporada') {
      // Na temporada o número que interessa é a diária, não o pacote de sete noites.
      const diaria = candidatos.find((c) => /(diaria|noite|por dia)/.test(c.contexto));
      preco = (diaria ?? candidatos.reduce((a, b) => (a.valor <= b.valor ? a : b))).valor;
    } else if (finalidade === 'aluguel') {
      const mensal = candidatos.find((c) => /(mes|mensal|aluguel)/.test(c.contexto));
      preco = (mensal ?? candidatos.reduce((a, b) => (a.valor >= b.valor ? a : b))).valor;
    } else {
      preco = candidatos.reduce((a, b) => (a.valor >= b.valor ? a : b)).valor;
    }
  }
  return { preco, condominio, iptu };
}

function extrairTelefone(texto: string): string | null {
  const m = texto.match(/(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s.]?\d{4}/);
  if (!m) return null;
  const digitos = m[0].replace(/\D/g, '');
  return digitos.length >= 10 && digitos.length <= 13 ? m[0].trim() : null;
}

function extrairAreas(texto: string): { areaUtil: number | null; areaTerreno: number | null } {
  const t = normalizar(texto);
  const areaTerreno = acharAreaRotulada(t, ROTULO_TERRENO);
  let areaUtil = acharAreaRotulada(t, ROTULO_CONSTRUIDO);

  if (areaUtil === null) {
    // Sem rótulo: pega a primeira medida que não seja a do terreno.
    for (const m of t.matchAll(/(\d[\d.,]*)\s*(?:m2|m²|metros quadrados)/g)) {
      const v = parseArea(m[1] + ' m2');
      if (v !== null && v !== areaTerreno) {
        areaUtil = v;
        break;
      }
    }
  }
  return { areaUtil, areaTerreno };
}

/**
 * Quem acompanha grupo de Facebook copia vários posts de uma vez. Cada bloco separado por
 * linha em branco (ou por uma linha de traços) que tenha preço vira um anúncio.
 *
 * Blocos sem preço são juntados ao anterior: é comum o post ter uma linha solta com o
 * telefone ou com "aceito proposta" depois de uma linha em branco.
 */
export function separarAnuncios(texto: string): string[] {
  const blocos = texto
    .split(/\n\s*(?:[-–—=_*]{3,}|\n)\s*\n?/)
    .map((b) => b.trim())
    .filter(Boolean);

  const juntados: string[] = [];
  for (const bloco of blocos) {
    const temPreco = /r\$\s*[\d.,]+/i.test(bloco);
    if (temPreco || !juntados.length) juntados.push(bloco);
    else juntados[juntados.length - 1] += '\n' + bloco;
  }
  return juntados.filter((b) => /r\$\s*[\d.,]+/i.test(b));
}

export function parseAnuncioColado(texto: string, fonteRotulo = 'Colado à mão'): AnuncioColado {
  const linhas = texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const primeiraLinha = linhas[0] ?? '';
  const corpo = texto;

  const finalidade: Finalidade | null = detectFinalidade(corpo);
  const tipo: TipoImovel | null = detectTipo(corpo);
  const { preco, condominio, iptu } = classificarValores(extrairValores(corpo), finalidade);
  const { areaUtil, areaTerreno } = extrairAreas(corpo);
  const quartos = parseQuantidade(corpo, PADROES.quartos);
  const suites = parseQuantidade(corpo, PADROES.suites);
  const banheiros = parseQuantidade(corpo, PADROES.banheiros);
  const vagas = parseQuantidade(corpo, PADROES.vagas);
  const caracteristicas = detectCaracteristicas(corpo);
  const telefone = extrairTelefone(corpo);

  // Título curto: a primeira linha costuma ser a chamada do anúncio.
  const titulo =
    primeiraLinha.length > 4 && primeiraLinha.length <= 120
      ? primeiraLinha
      : `${tipo ? tipo[0].toUpperCase() + tipo.slice(1) : 'Imóvel'} em Ilhabela`;

  const camposDetectados = Object.entries({
    finalidade,
    tipo,
    preco,
    areaUtil,
    areaTerreno,
    quartos,
    suites,
    banheiros,
    vagas,
    condominio,
    iptu,
    telefone,
  })
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k]) => k);

  return {
    fonte: 'colado',
    nomeFonte: fonteRotulo,
    url: '',
    titulo,
    finalidade,
    tipo,
    preco,
    precoTexto: null,
    bairroTexto: corpo,
    areaUtil,
    areaTerreno,
    areaUtilTexto: areaUtil ? String(areaUtil) : null,
    areaTerrenoTexto: areaTerreno ? String(areaTerreno) : null,
    quartos,
    suites,
    banheiros,
    vagas,
    descricao: corpo.slice(0, 2000),
    fotos: [],
    telefone,
    condominio,
    iptu,
    caracteristicas,
    camposDetectados,
  };
}
