/**
 * Utilidades de rede do coletor, separadas do `cli.ts` de propósito: aquele arquivo executa a
 * coleta ao ser importado, e um teste que precisasse de uma função dele acabaria disparando
 * uma coleta de verdade.
 */

/**
 * `Response.text()` decodifica sempre como UTF-8, por especificação. Parte dos sites de
 * imobiliária ainda serve ISO-8859-1, e aí "Armação" chega como "Arma�o": o bairro deixa
 * de ser reconhecido e o anúncio é descartado. A codificação certa vem do cabeçalho
 * Content-Type e, quando ele não diz, do <meta charset> da própria página.
 */
export function decodificar(bytes: ArrayBuffer, contentType: string | null): string {
  const doCabecalho = contentType?.match(/charset=["']?([\w-]+)/i)?.[1];
  const inicio = new TextDecoder('latin1').decode(bytes.slice(0, 2048));
  const doMeta =
    inicio.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
    inicio.match(/<meta[^>]+content=["'][^"']*charset=([\w-]+)/i)?.[1];

  const nome = (doCabecalho ?? doMeta ?? 'utf-8').toLowerCase();
  try {
    return new TextDecoder(nome, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}
