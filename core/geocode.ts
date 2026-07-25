import type { BairroGazetteer, Gazetteer, PrecisaoGeo, Zona } from './types';
import { espalharPorId, pontoNaZona } from './geometry';
import { normalizar } from './texto';

/**
 * Geocodificação sem serviço externo: os anúncios de Ilhabela dizem o bairro/praia, não a
 * coordenada. O índice casa o texto do anúncio com o gazetteer e devolve uma posição dentro
 * da zona certa — precisão de bairro, e o aplicativo mostra isso ao usuário.
 */
export interface IndiceGeo {
  bairros: BairroGazetteer[];
  zonaPorId: Map<string, Zona>;
  /** apelidos ordenados do mais longo para o mais curto, para "Praia Grande" ganhar de "Grande". */
  apelidos: { termo: RegExp; bairro: BairroGazetteer }[];
}

export function criarIndiceGeo(gaz: Gazetteer, zonas: Zona[]): IndiceGeo {
  const apelidos: { termo: RegExp; bairro: BairroGazetteer }[] = [];
  for (const b of gaz.bairros) {
    const termos = new Set([b.nome, ...b.apelidos].map(normalizar));
    for (const t of termos) {
      const limpo = t.replace(/\(|\)/g, '').trim();
      if (limpo.length < 3) continue;
      apelidos.push({
        termo: new RegExp(`(^|[^a-z0-9])${escaparRegex(limpo)}([^a-z0-9]|$)`),
        bairro: b,
      });
    }
  }
  apelidos.sort((a, b) => b.termo.source.length - a.termo.source.length);
  return {
    bairros: gaz.bairros,
    zonaPorId: new Map(zonas.map((z) => [z.id, z])),
    apelidos,
  };
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function resolverBairro(texto: string | null | undefined, ix: IndiceGeo): BairroGazetteer | null {
  if (!texto) return null;
  const t = normalizar(texto);
  for (const { termo, bairro } of ix.apelidos) {
    if (termo.test(t)) return bairro;
  }
  return null;
}

export function zonaDaCoordenada(lat: number, lon: number, ix: IndiceGeo): Zona | null {
  for (const z of ix.zonaPorId.values()) {
    if (pontoNaZona(lat, lon, z.poligono)) return z;
  }
  return null;
}

export interface Posicao {
  lat: number;
  lon: number;
  bairroId: string;
  bairro: string;
  setor: BairroGazetteer['setor'];
  precisao: PrecisaoGeo;
}

/**
 * Posiciona um anúncio. Com coordenada do próprio anúncio, usa-a e descobre a zona; sem ela,
 * usa a âncora da zona com um deslocamento determinístico (mesmo id → mesmo ponto sempre),
 * mantendo o pino dentro do polígono da zona.
 */
export function posicionar(
  id: string,
  bairro: BairroGazetteer,
  ix: IndiceGeo,
  coordenada?: { lat?: number | null; lon?: number | null },
): Posicao {
  const zona = ix.zonaPorId.get(bairro.id);
  const base = {
    bairroId: bairro.id,
    bairro: bairro.nome,
    setor: bairro.setor,
  };

  const lat = coordenada?.lat;
  const lon = coordenada?.lon;
  if (typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon)) {
    const z = zonaDaCoordenada(lat, lon, ix);
    if (z) {
      return { ...base, bairroId: z.id, bairro: z.nome, setor: z.setor, lat, lon, precisao: 'exata' };
    }
  }

  if (!zona) {
    return { ...base, lat: bairro.lat, lon: bairro.lon, precisao: 'bairro' };
  }

  const [aLat, aLon] = zona.ancora;
  const { dLat, dLon } = espalharPorId(id);
  for (const fator of [1, 0.6, 0.35, 0.15]) {
    const cLat = aLat + dLat * fator;
    const cLon = aLon + dLon * fator;
    if (pontoNaZona(cLat, cLon, zona.poligono)) {
      return { ...base, lat: cLat, lon: cLon, precisao: 'bairro' };
    }
  }
  return { ...base, lat: aLat, lon: aLon, precisao: 'bairro' };
}
