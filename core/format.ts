import type { Finalidade, TipoImovel } from './types';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** Preços de venda ficam ilegíveis por extenso: 1.850.000 vira "R$ 1,85 mi". */
export function formatarPreco(valor: number | null, finalidade: Finalidade): string {
  if (valor === null || !Number.isFinite(valor) || valor <= 0) return 'sob consulta';
  const sufixo = finalidade === 'aluguel' ? '/mês' : finalidade === 'temporada' ? '/noite' : '';
  if (finalidade === 'venda' && valor >= 1_000_000) {
    const mi = valor / 1_000_000;
    return `R$ ${mi.toFixed(mi >= 10 ? 1 : 2).replace('.', ',')} mi`;
  }
  return brl.format(valor) + sufixo;
}

export function formatarPrecoCompleto(valor: number | null, finalidade: Finalidade): string {
  if (valor === null || !Number.isFinite(valor) || valor <= 0) return 'sob consulta';
  const sufixo = finalidade === 'aluguel' ? ' por mês' : finalidade === 'temporada' ? ' por noite' : '';
  return brl.format(valor) + sufixo;
}

export function formatarArea(valor: number | null): string {
  if (valor === null || !Number.isFinite(valor) || valor <= 0) return '—';
  return `${numero.format(valor)} m²`;
}

export function formatarPrecoM2(valor: number | null, finalidade: Finalidade): string {
  if (valor === null || !Number.isFinite(valor) || valor <= 0) return '—';
  const unidade = finalidade === 'venda' ? '/m²' : finalidade === 'aluguel' ? '/m²/mês' : '/m²/noite';
  return brl.format(valor) + unidade;
}

export function formatarNumero(valor: number | null): string {
  if (valor === null || !Number.isFinite(valor)) return '—';
  return numero.format(valor);
}

export function formatarData(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function rotuloFinalidade(f: Finalidade): string {
  return f === 'venda' ? 'Comprar' : f === 'aluguel' ? 'Alugar' : 'Temporada';
}

export function rotuloTipo(t: TipoImovel): string {
  const mapa: Record<TipoImovel, string> = {
    casa: 'Casa',
    apartamento: 'Apartamento',
    terreno: 'Terreno',
    comercial: 'Comercial',
    pousada: 'Pousada',
    outro: 'Outro',
  };
  return mapa[t];
}

export function rotuloCaracteristica(c: string): string {
  const mapa: Record<string, string> = {
    'vista-mar': 'Vista para o mar',
    'pe-na-areia': 'Pé na areia',
    piscina: 'Piscina',
    'condominio-fechado': 'Condomínio fechado',
    mobiliado: 'Mobiliado',
    'aceita-pet': 'Aceita pet',
    churrasqueira: 'Churrasqueira',
    'ar-condicionado': 'Ar-condicionado',
    'vaga-barco': 'Vaga para barco',
    'area-gourmet': 'Área gourmet',
  };
  return mapa[c] ?? c;
}

export function plural(n: number, singular: string, pluralPalavra: string): string {
  return `${numero.format(n)} ${n === 1 ? singular : pluralPalavra}`;
}
