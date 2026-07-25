/** Utilidades de texto em pt-BR usadas pelo coletor, pelo parser e pelo aplicativo. */

/** minúsculas, sem acento, sem pontuação repetida — base de toda comparação. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function slug(texto: string): string {
  return normalizar(texto)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Similaridade de Jaccard sobre trigramas — desempata anúncios do mesmo imóvel. */
export function similaridade(a: string, b: string): number {
  const tri = (s: string) => {
    const t = ` ${normalizar(s).replace(/[^a-z0-9 ]/g, '')} `;
    const set = new Set<string>();
    for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
    return set;
  };
  const A = tri(a);
  const B = tri(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

const NUMEROS_ESCRITOS: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
};

export function numeroEscrito(palavra: string): number | null {
  return NUMEROS_ESCRITOS[normalizar(palavra)] ?? null;
}

/**
 * Converte um número escrito em português para `number`.
 *
 * Regras de separador: quando há ponto e vírgula, o ponto é milhar e a vírgula é decimal
 * ("1.200.000,50"); só vírgula, ela é decimal ("1,2"); só ponto, é milhar quando os grupos
 * têm três dígitos ("1.200") e decimal caso contrário ("1.2").
 */
export function parseNumeroBR(bruto: string): number | null {
  const s = bruto.trim().replace(/\s/g, '');
  if (!/\d/.test(s)) return null;
  const temPonto = s.includes('.');
  const temVirgula = s.includes(',');
  let limpo: string;
  if (temPonto && temVirgula) {
    limpo = s.replace(/\./g, '').replace(',', '.');
  } else if (temVirgula) {
    limpo = s.replace(',', '.');
  } else if (temPonto) {
    limpo = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
  } else {
    limpo = s;
  }
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}
