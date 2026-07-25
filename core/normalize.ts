import type { AnuncioBruto, Caracteristica, Finalidade, TipoImovel } from './types';
import { normalizar, numeroEscrito, parseNumeroBR } from './texto';

/**
 * Extrai um valor em reais de texto solto de anúncio.
 * Cobre "R$ 1.200.000", "1,2 milhões", "850 mil", "R$ 4.500/mês", "R$ 350 a diária".
 * Devolve `null` quando o anúncio não informa preço ("sob consulta", "a combinar").
 */
export function parsePreco(bruto: string | null | undefined): number | null {
  if (!bruto) return null;
  const t = normalizar(bruto);
  if (/(sob\s+consulta|a\s+combinar|consulte|preco\s+sob)/.test(t)) return null;

  // O texto já vem sem acento de `normalizar`, então "milhões" chega como "milhoes".
  const m = t.match(/(?:r\$\s*)?(\d[\d.,]*)\s*(milhoes|milhao|mi\b|mil\b|k\b)?/);
  if (!m) return null;
  const base = parseNumeroBR(m[1]);
  if (base === null) return null;

  const unidade = m[2];
  let valor = base;
  if (unidade === 'mi' || unidade?.startsWith('milh')) valor = base * 1_000_000;
  else if (unidade === 'mil' || unidade === 'k') valor = base * 1_000;
  return valor > 0 ? Math.round(valor) : null;
}

/**
 * Preço por m². Na venda os valores são grandes e o arredondamento para inteiro basta; na
 * temporada a diária por m² fica na casa das unidades, e arredondar mataria a informação.
 */
export function calcularPrecoM2(preco: number | null, area: number | null): number | null {
  if (!preco || !area || preco <= 0 || area <= 0) return null;
  const v = preco / area;
  return v >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
}

const MEDIDA = '(?:m2|m²|metros(?:\\s+quadrados)?)';

export const ROTULO_TERRENO = 'terreno|lote|area do terreno';
export const ROTULO_CONSTRUIDO = 'area (?:util|construida)|area de construcao|construidos|construcao';

/**
 * Procura uma metragem pelo rótulo, nas duas ordens em que as pessoas escrevem:
 * "180 m² de área construída" e "área construída de 180 m²". Olhar só uma ordem faz o
 * rótulo capturar o número do vizinho — em "180 m² de área construída em terreno de 450 m²",
 * a busca por "área construída …" acharia 450.
 *
 * O conectivo aceito antes do rótulo é só "de": em "180 m² em terreno de 450 m²", o "em
 * terreno" diz onde a casa está, e o número do terreno é o que vem depois.
 */
export function acharAreaRotulada(texto: string, rotulo: string): number | null {
  const t = normalizar(texto);
  const antesDoRotulo = new RegExp(`(\\d[\\d.,]*)\\s*${MEDIDA}\\s*(?:de\\s+)?(?:${rotulo})`);
  const depoisDoRotulo = new RegExp(`(?:${rotulo})[^\\d]{0,20}(\\d[\\d.,]*)\\s*${MEDIDA}`);
  const m = t.match(antesDoRotulo) ?? t.match(depoisDoRotulo);
  return m ? parseArea(`${m[1]} m2`) : null;
}

/** Área em m². Aceita "120 m²", "120m2", "1.200 metros quadrados", "120,5 m²". */
export function parseArea(bruto: string | null | undefined): number | null {
  if (!bruto) return null;
  const t = normalizar(bruto);
  const m = t.match(/(\d[\d.,]*)\s*(m2|m²|m\b|metros?\s*(quadrados?)?)/);
  const alvo = m ? m[1] : /^\d[\d.,]*$/.test(t) ? t : null;
  if (!alvo) return null;
  const n = parseNumeroBR(alvo);
  if (n === null || n <= 0 || n > 500_000) return null;
  return Math.round(n * 100) / 100;
}

/** Quantidade de cômodos. Aceita dígito ou número escrito ("três suítes"). */
export function parseQuantidade(
  bruto: string | null | undefined,
  padroes: RegExp[],
): number | null {
  if (!bruto) return null;
  const t = normalizar(bruto);
  for (const re of padroes) {
    const m = t.match(re);
    if (!m) continue;
    const cru = m[1];
    const n = /^\d+$/.test(cru) ? Number(cru) : numeroEscrito(cru);
    if (n !== null && n >= 0 && n <= 30) return n;
  }
  return null;
}

const PAL = '(\\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)';

export const PADROES = {
  quartos: [
    new RegExp(`${PAL}\\s*(?:quartos?|dorm(?:itorios?|s)?\\b|qtos?\\b|qts?\\b|suites? e )`),
    new RegExp(`${PAL}\\s*/\\s*\\d`), // "3/4" = 3 quartos
  ],
  suites: [new RegExp(`${PAL}\\s*(?:suites?|ste?s?\\b)`)],
  banheiros: [new RegExp(`${PAL}\\s*(?:banheiros?|wc\\b|lavabos?)`)],
  vagas: [new RegExp(`${PAL}\\s*(?:vagas?|garagens?|carros?)`)],
};

export function detectFinalidade(texto: string): Finalidade | null {
  const t = normalizar(texto);
  if (/(temporada|diaria|por noite|\/noite|feriado|pacote de ano novo|carnaval)/.test(t)) {
    return 'temporada';
  }
  if (/(aluguel|alugar|alugo|loca(cao|-se)|aluga-?se|\/mes|por mes|mensal|anual)/.test(t)) {
    return 'aluguel';
  }
  if (/(venda|vende-?se|vendo\b|a venda|comprar|compra)/.test(t)) return 'venda';
  return null;
}

/**
 * Quase todo anúncio de casa cita "terreno de 450 m²", e quase todo anúncio de terreno cita
 * "ideal para construir sua casa". Decidir por ordem de regra erraria os dois: vale o termo
 * que aparece primeiro, que é o que o anúncio está de fato vendendo.
 */
const REGRAS_TIPO: [TipoImovel, RegExp][] = [
  ['pousada', /(pousada|hotel|hostel)/],
  ['apartamento', /(apartamento|apto\b|flat\b|studio\b|kitnet|cobertura)/],
  ['comercial', /(sala comercial|loja\b|ponto comercial|galpao|imovel comercial)/],
  ['casa', /(casa|sobrado|chacara|sitio|residencia|mansao)/],
  ['terreno', /(terreno|lote\b|gleba)/],
];

export function detectTipo(texto: string): TipoImovel | null {
  const t = normalizar(texto);
  let melhor: { tipo: TipoImovel; pos: number; prioridade: number } | null = null;
  REGRAS_TIPO.forEach(([tipo, re], prioridade) => {
    const m = t.match(re);
    if (!m || m.index === undefined) return;
    if (
      !melhor ||
      m.index < melhor.pos ||
      (m.index === melhor.pos && prioridade < melhor.prioridade)
    ) {
      melhor = { tipo, pos: m.index, prioridade };
    }
  });
  return melhor ? (melhor as { tipo: TipoImovel }).tipo : null;
}

const REGRAS_CARACTERISTICA: [Caracteristica, RegExp][] = [
  ['vista-mar', /(vista (para o )?mar|vista panoramica|vista deslumbrante|frente (para o )?mar)/],
  ['pe-na-areia', /(pe na areia|pe-na-areia|beira mar|beira-mar|acesso direto a praia)/],
  ['piscina', /piscina/],
  ['condominio-fechado', /(condominio fechado|condominio com portaria|portaria 24)/],
  ['mobiliado', /(mobiliad|semi ?mobiliad|com moveis planejados|equipada)/],
  ['aceita-pet', /(aceita pet|pet friendly|aceitamos pets|permitido animais)/],
  ['churrasqueira', /churrasqueir/],
  ['ar-condicionado', /(ar condicionado|ar-condicionado|split)/],
  ['vaga-barco', /(vaga para barco|rampa para barco|garagem nautica|poita)/],
  ['area-gourmet', /(area gourmet|espaco gourmet|varanda gourmet)/],
];

export function detectCaracteristicas(texto: string): Caracteristica[] {
  const t = normalizar(texto);
  const achadas = REGRAS_CARACTERISTICA.filter(([, re]) => re.test(t)).map(([c]) => c);
  return [...new Set(achadas)];
}

/**
 * Preenche os campos que o adapter não conseguiu ler diretamente, garimpando no título e na
 * descrição. Um adapter só precisa entregar o que o HTML dá de bandeja.
 */
export function completarPorTexto(a: AnuncioBruto): AnuncioBruto {
  const corpo = [a.titulo, a.descricao ?? ''].join(' . ');
  return {
    ...a,
    finalidade: a.finalidade ?? detectFinalidade(corpo),
    tipo: a.tipo ?? detectTipo(corpo),
    preco: a.preco ?? parsePreco(a.precoTexto ?? corpo),
    quartos: a.quartos ?? parseQuantidade(corpo, PADROES.quartos),
    suites: a.suites ?? parseQuantidade(corpo, PADROES.suites),
    banheiros: a.banheiros ?? parseQuantidade(corpo, PADROES.banheiros),
    vagas: a.vagas ?? parseQuantidade(corpo, PADROES.vagas),
  };
}
