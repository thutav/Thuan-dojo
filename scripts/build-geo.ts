/**
 * Gera a base geográfica do aplicativo:
 *
 *   data/ilhabela.outline.json  contorno do município (IBGE 3520400), suavizado
 *   data/zones.json             uma zona por bairro do gazetteer (Voronoi recortado na ilha)
 *
 * A malha vem de tbrugz/geodata-br, que republica a malha municipal do IBGE em GeoJSON.
 * O download é cacheado em scripts/.cache para o script rodar offline depois da primeira vez
 * (este ambiente de desenvolvimento só alcança npm e raw.githubusercontent.com).
 *
 *   npm run build:geo            usa o cache quando existir
 *   npm run build:geo -- --refresh  força novo download
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Delaunay } from 'd3-delaunay';
import polygonClipping, { type Geom, type Pair } from 'polygon-clipping';
import type { Gazetteer, Ponto, Ring, ZonesFile } from '../core/types';
import { nearestPointOnRing, pointInRing, ringArea, ringCentroid } from '../core/geometry';

const root = fileURLToPath(new URL('..', import.meta.url));
const cacheDir = path.join(root, 'scripts', '.cache');
const dataDir = path.join(root, 'data');

const MALHA_URL =
  'https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-35-mun.json';
const COD_IBGE_ILHABELA = '3520400';

async function carregarMalha(refresh: boolean): Promise<unknown> {
  mkdirSync(cacheDir, { recursive: true });
  const cache = path.join(cacheDir, 'geojs-35-mun.json');
  if (!refresh && existsSync(cache)) {
    return JSON.parse(readFileSync(cache, 'utf8'));
  }
  const res = await fetch(MALHA_URL);
  if (!res.ok) throw new Error(`Falha ao baixar a malha municipal: HTTP ${res.status}`);
  const texto = await res.text();
  writeFileSync(cache, texto);
  return JSON.parse(texto);
}

/** Chaikin: arredonda o polígono sem inventar detalhe que não existe na malha. */
function suavizar(ring: Ring, iteracoes: number): Ring {
  let atual = ring;
  for (let it = 0; it < iteracoes; it++) {
    const saida: Ring = [];
    for (let i = 0; i < atual.length; i++) {
      const a = atual[i];
      const b = atual[(i + 1) % atual.length];
      saida.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      saida.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    atual = saida;
  }
  return atual;
}

/**
 * Alcance de cada bairro a partir da sua âncora. Em torno de 2,5 km cobre a faixa onde as
 * casas de Ilhabela realmente estão — entre a praia e o pé da serra — sem avançar sobre o
 * Parque Estadual, que ocupa a maior parte do interior e não tem imóvel à venda.
 */
const RAIO_ZONA_KM = 2.5;

/** Disco em coordenadas geográficas: a longitude encolhe conforme o cosseno da latitude. */
function discoEmGraus(centro: Ponto, raioKm: number, lados = 48): Pair[] {
  const dLat = raioKm / 111.32;
  const dLon = raioKm / (111.32 * Math.cos((centro[1] * Math.PI) / 180));
  const pontos: Pair[] = [];
  for (let i = 0; i < lados; i++) {
    const a = (i / lados) * Math.PI * 2;
    pontos.push([centro[0] + Math.cos(a) * dLon, centro[1] + Math.sin(a) * dLat]);
  }
  pontos.push(pontos[0]);
  return pontos;
}

function arredondar(ring: Ring, casas = 5): Ring {
  const f = 10 ** casas;
  return ring.map(([x, y]) => [Math.round(x * f) / f, Math.round(y * f) / f] as [number, number]);
}

async function main() {
  const refresh = process.argv.includes('--refresh');
  const malha = (await carregarMalha(refresh)) as {
    features: { properties: Record<string, string>; geometry: { type: string; coordinates: unknown } }[];
  };

  const feature = malha.features.find((f) => f.properties.id === COD_IBGE_ILHABELA);
  if (!feature) throw new Error('Município de Ilhabela não encontrado na malha de SP');

  // A malha traz Ilhabela como um Polygon cujos "anéis" são, na verdade, as ilhas do
  // arquipélago. O maior é a ilha de São Sebastião; os demais são ilhotas.
  const aneis = feature.geometry.coordinates as Ring[];
  const ordenados = [...aneis].sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
  const principal = arredondar(suavizar(ordenados[0], 2));
  const ilhotas = ordenados.slice(1).map((r) => arredondar(suavizar(r, 1)));

  const outline = {
    _leiame:
      'Contorno do município de Ilhabela (IBGE 3520400), malha municipal republicada por tbrugz/geodata-br, suavizada com Chaikin. Gerado por scripts/build-geo.ts — não editar à mão.',
    fonte: MALHA_URL,
    geradoEm: new Date().toISOString().slice(0, 10),
    principal,
    ilhotas,
  };
  writeFileSync(path.join(dataDir, 'ilhabela.outline.json'), JSON.stringify(outline));

  // ---- zonas -------------------------------------------------------------
  const gaz = JSON.parse(readFileSync(path.join(dataDir, 'gazetteer.json'), 'utf8')) as Gazetteer;

  const centroIlha = ringCentroid(principal);
  const problemas: string[] = [];
  const pontos = gaz.bairros.map((b) => {
    let [lon, lat] = [b.lon, b.lat];
    if (!pointInRing([lon, lat], principal)) {
      // A malha municipal é simplificada (98 vértices para 27 km de ilha), então a âncora
      // de um bairro de praia pode cair "na água" mesmo estando certa. Em vez de puxar o
      // bairro para o miolo da ilha, projeta na costa mais próxima e entra poucos metros —
      // assim Armação continua no norte e Curral continua no sul.
      const { ponto: naCosta, distancia } = nearestPointOnRing([lon, lat], principal);
      let entrou = false;
      for (let passo = 1; passo <= 40; passo++) {
        const t = passo * 0.02;
        const cand: [number, number] = [
          naCosta[0] + (centroIlha[0] - naCosta[0]) * t * 0.05,
          naCosta[1] + (centroIlha[1] - naCosta[1]) * t * 0.05,
        ];
        if (pointInRing(cand, principal)) {
          [lon, lat] = cand;
          entrou = true;
          break;
        }
      }
      if (!entrou) throw new Error(`Âncora de ${b.nome} não pôde ser colocada dentro da ilha`);
      problemas.push(
        `${b.nome}: projetada na costa (${(distancia * 111).toFixed(2)} km de ajuste)`,
      );
    }
    return { bairro: b, ponto: [lon, lat] as [number, number] };
  });

  const xs = principal.map((p) => p[0]);
  const ys = principal.map((p) => p[1]);
  const margem = 0.05;
  const bounds: [number, number, number, number] = [
    Math.min(...xs) - margem,
    Math.min(...ys) - margem,
    Math.max(...xs) + margem,
    Math.max(...ys) + margem,
  ];

  const delaunay = Delaunay.from(pontos.map((p) => p.ponto));
  const voronoi = delaunay.voronoi(bounds);
  const ilha: Geom = [[principal.map(([x, y]) => [x, y] as Pair)]];

  const zonas: ZonesFile['zonas'] = [];
  pontos.forEach(({ bairro, ponto }, i) => {
    const celula = voronoi.cellPolygon(i);
    if (!celula) throw new Error(`Voronoi não gerou célula para ${bairro.nome}`);

    // Só o Voronoi produziria cunhas radiais cortando o miolo da ilha: como todas as âncoras
    // estão na costa, o bairro mais próximo "herdaria" quilômetros de mata do Parque Estadual
    // onde não existe imóvel nenhum. Limitar cada zona a um raio em volta da âncora mantém o
    // mapa na faixa costeira habitada, que é a única sobre a qual há o que dizer.
    const recorte = polygonClipping.intersection(
      ilha,
      [[celula.map(([x, y]) => [x, y] as Pair)]],
      [[discoEmGraus(ponto, RAIO_ZONA_KM)]],
    );
    if (!recorte.length) throw new Error(`Zona de ${bairro.nome} ficou vazia após o recorte`);

    // Um recorte pode render várias partes (a ilha é recortada, não a célula): fica a maior.
    const partes = recorte.flatMap((poly) => poly.map((anel) => anel as Ring));
    const maior = partes.reduce((a, b) => (Math.abs(ringArea(b)) > Math.abs(ringArea(a)) ? b : a));

    zonas.push({
      id: bairro.id,
      nome: bairro.nome,
      setor: bairro.setor,
      ordemCosteira: bairro.ordemCosteira,
      ancora: [ponto[1], ponto[0]],
      poligono: arredondar(maior, 5).map(([x, y]) => [y, x] as [number, number]),
    });
  });

  const zonesFile: ZonesFile = {
    _leiame:
      'Zonas de bairro para o mapa coroplético: Voronoi sobre as âncoras do gazetteer, recortado pelo contorno da ilha. Coordenadas em [lat, lon]. Gerado por scripts/build-geo.ts — para mudar uma zona, mova a âncora em data/gazetteer.json e rode npm run build:geo.',
    geradoEm: new Date().toISOString().slice(0, 10),
    zonas: zonas.sort((a, b) => a.ordemCosteira - b.ordemCosteira),
  };
  writeFileSync(path.join(dataDir, 'zones.json'), JSON.stringify(zonesFile));

  // ---- validação ---------------------------------------------------------
  const areaIlha = Math.abs(ringArea(principal));
  const areaZonas = zonesFile.zonas.reduce(
    (s, z) => s + Math.abs(ringArea(z.poligono.map(([lat, lon]) => [lon, lat] as [number, number]))),
    0,
  );
  const cobertura = areaZonas / areaIlha;
  // As zonas cobrem a faixa costeira, não a ilha inteira: cobrir tudo significaria estender
  // bairro por cima do parque estadual. Cobrir quase nada significaria raio pequeno demais.
  if (cobertura < 0.25 || cobertura > 0.95) {
    throw new Error(
      `Cobertura costeira fora do esperado: ${(cobertura * 100).toFixed(1)}% da ilha. Ajuste RAIO_ZONA_KM.`,
    );
  }
  for (const z of zonesFile.zonas) {
    if (z.poligono.length < 3) throw new Error(`Zona ${z.nome} tem menos de 3 vértices`);
    if (!pointInRing([z.ancora[1], z.ancora[0]], z.poligono.map(([la, lo]) => [lo, la] as Ponto))) {
      throw new Error(`A âncora de ${z.nome} caiu fora da própria zona`);
    }
  }

  console.log(`contorno: ${principal.length} vértices + ${ilhotas.length} ilhotas`);
  console.log(
    `zonas: ${zonesFile.zonas.length}, faixa costeira = ${(cobertura * 100).toFixed(1)}% da ilha`,
  );
  if (problemas.length) {
    console.log('âncoras ajustadas:');
    for (const p of problemas) console.log('  - ' + p);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
