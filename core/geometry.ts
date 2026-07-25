import type { Ponto, Ring } from './types';

/** Área com sinal (fórmula do cadarço). Em graus² — serve para comparar tamanhos. */
export function ringArea(ring: Ring): number {
  let soma = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    soma += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return soma / 2;
}

export function ringCentroid(ring: Ring): Ponto {
  const a = ringArea(ring);
  if (Math.abs(a) < 1e-12) {
    const n = ring.length || 1;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    cx += (ring[j][0] + ring[i][0]) * f;
    cy += (ring[j][1] + ring[i][1]) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/** Ray casting. Ponto e anel em [lon, lat]. */
export function pointInRing(p: Ponto, ring: Ring): boolean {
  let dentro = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      dentro = !dentro;
    }
  }
  return dentro;
}

/** Versão para os polígonos de zona, que o Leaflet guarda em [lat, lon]. */
export function pontoNaZona(lat: number, lon: number, poligono: [number, number][]): boolean {
  return pointInRing([lon, lat], poligono.map(([la, lo]) => [lo, la] as Ponto));
}

/** Ponto mais próximo sobre o contorno do anel, e a distância até ele (em graus). */
export function nearestPointOnRing(p: Ponto, ring: Ring): { ponto: Ponto; distancia: number } {
  let melhor: Ponto = ring[0];
  let melhorD = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j];
    const b = ring[i];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2));
    const q: Ponto = [a[0] + vx * t, a[1] + vy * t];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < melhorD) {
      melhorD = d;
      melhor = q;
    }
  }
  return { ponto: melhor, distancia: melhorD };
}

export function bbox(ring: Ring): [number, number, number, number] {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

const RAIO_TERRA_KM = 6371;

/** Distância em quilômetros entre duas coordenadas [lat, lon]. */
export function distanciaKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Deslocamento determinístico a partir do id do imóvel: dois anúncios do mesmo bairro não
 * se empilham no mesmo pino, e a posição não muda a cada coleta.
 */
export function espalharPorId(id: string, raioGraus = 0.0075): { dLat: number; dLon: number } {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const angulo = ((h >>> 0) % 3600) / 3600 * Math.PI * 2;
  const r = Math.sqrt((((h >>> 8) % 1000) + 1) / 1000) * raioGraus;
  return { dLat: Math.sin(angulo) * r, dLon: Math.cos(angulo) * r };
}
