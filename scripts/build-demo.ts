/**
 * Gera data/listings.demo.json — a semente de DEMONSTRAÇÃO.
 *
 * Os valores aqui são sintéticos. Servem para o aplicativo poder ser usado e conferido antes
 * da primeira coleta real, e nada mais: cada registro sai com `demo: true`, cada card mostra
 * o selo "demo" e a interface exibe um aviso fixo enquanto o dataset for este. Assim que o
 * coletor grava data/listings.json, o aplicativo passa a usar os dados reais e para de ler
 * este arquivo.
 *
 * A geração é determinística (semente fixa): rodar de novo não muda o dataset, o que evita
 * ruído no diff a cada commit.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarIndiceGeo, posicionar } from '../core/geocode';
import { calcularPrecoM2 } from '../core/normalize';
import type {
  Caracteristica,
  Dataset,
  Finalidade,
  Gazetteer,
  Imovel,
  TipoImovel,
  ZonesFile,
} from '../core/types';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const dataDir = path.join(raiz, 'data');

/** Gerador congruente linear — determinístico e sem dependência. */
function criarAleatorio(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const gaz = JSON.parse(readFileSync(path.join(dataDir, 'gazetteer.json'), 'utf8')) as Gazetteer;
const zonas = JSON.parse(readFileSync(path.join(dataDir, 'zones.json'), 'utf8')) as ZonesFile;
const ix = criarIndiceGeo(gaz, zonas.zonas);

/**
 * Patamar relativo de preço por bairro. Não é medição de mercado — é só uma variação
 * plausível para que o mapa coroplético tenha o que mostrar antes da coleta real.
 */
const PATAMAR: Record<string, number> = {
  'ponta-das-canas': 1.05,
  pacuiba: 0.95,
  armacao: 1.0,
  viana: 0.95,
  siriuba: 1.1,
  pinto: 1.05,
  'engenho-dagua': 1.15,
  'santa-teresa': 1.05,
  vila: 1.2,
  itaguacu: 1.0,
  itaquanduba: 0.9,
  cocaia: 0.8,
  'barra-velha': 0.85,
  pereque: 0.8,
  'saco-da-capela': 1.25,
  portinho: 1.15,
  'praia-grande': 1.0,
  curral: 1.3,
  feiticeira: 1.15,
  juliao: 1.2,
  veloso: 1.1,
  sepituba: 0.9,
  'agua-branca': 0.85,
  borrifos: 0.8,
  'ponta-da-sela': 0.75,
  bonete: 0.7,
  castelhanos: 0.65,
  jabaquara: 0.9,
};

/** Quantos anúncios cada bairro recebe — o miolo urbano concentra a oferta. */
const PESO_OFERTA: Record<string, number> = {
  pereque: 9,
  'barra-velha': 7,
  itaquanduba: 7,
  vila: 6,
  itaguacu: 6,
  cocaia: 5,
  'praia-grande': 5,
  curral: 5,
  'saco-da-capela': 4,
  'engenho-dagua': 4,
  feiticeira: 4,
  armacao: 4,
  viana: 3,
  'santa-teresa': 3,
  portinho: 3,
  juliao: 3,
  veloso: 3,
  siriuba: 3,
  pinto: 2,
  pacuiba: 2,
  'ponta-das-canas': 2,
  sepituba: 2,
  'agua-branca': 2,
  borrifos: 2,
  'ponta-da-sela': 1,
  bonete: 1,
  castelhanos: 1,
  jabaquara: 1,
};

const BASE_VENDA_M2 = 9_500;
const BASE_ALUGUEL_M2 = 38;
const BASE_DIARIA_M2 = 4.2;

const TIPOS: { tipo: TipoImovel; peso: number }[] = [
  { tipo: 'casa', peso: 58 },
  { tipo: 'apartamento', peso: 22 },
  { tipo: 'terreno', peso: 13 },
  { tipo: 'comercial', peso: 4 },
  { tipo: 'pousada', peso: 3 },
];

const CARACTERISTICAS: { c: Caracteristica; prob: number }[] = [
  { c: 'vista-mar', prob: 0.42 },
  { c: 'piscina', prob: 0.38 },
  { c: 'churrasqueira', prob: 0.45 },
  { c: 'area-gourmet', prob: 0.3 },
  { c: 'condominio-fechado', prob: 0.28 },
  { c: 'mobiliado', prob: 0.3 },
  { c: 'ar-condicionado', prob: 0.4 },
  { c: 'aceita-pet', prob: 0.25 },
  { c: 'pe-na-areia', prob: 0.09 },
  { c: 'vaga-barco', prob: 0.11 },
];

const CORRETORAS_DEMO = [
  { fonte: 'demo-a', nome: 'Corretora exemplo A' },
  { fonte: 'demo-b', nome: 'Corretora exemplo B' },
  { fonte: 'demo-c', nome: 'Corretora exemplo C' },
];

function escolherPeso<T>(itens: { peso: number }[] & T[], r: () => number): T {
  const total = itens.reduce((s, i) => s + i.peso, 0);
  let x = r() * total;
  for (const i of itens) {
    x -= i.peso;
    if (x <= 0) return i;
  }
  return itens[itens.length - 1];
}

/** Distribuição levemente assimétrica: muitos imóveis médios, poucos muito caros. */
function variacao(r: () => number, espalhamento: number): number {
  const u = (r() + r() + r()) / 3 - 0.5;
  return Math.exp(u * espalhamento);
}

function gerar(): Imovel[] {
  const r = criarAleatorio(20260725);
  const imoveis: Imovel[] = [];
  const hoje = new Date('2026-07-24');

  for (const bairro of gaz.bairros) {
    const peso = PESO_OFERTA[bairro.id] ?? 2;
    const patamar = PATAMAR[bairro.id] ?? 1;
    // O piso de 9 existe para que quase toda zona alcance a amostra mínima de venda e o
    // mapa coroplético possa ser conferido de ponta a ponta antes da coleta real.
    const quantidade = Math.max(14, Math.round(peso * 4.2));

    for (let k = 0; k < quantidade; k++) {
      // Em Ilhabela a oferta de temporada é grande e a de aluguel anual é magra — a semente
      // reproduz essa proporção para os três modos do mapa terem o que mostrar.
      const sorteio = r();
      const finalidade: Finalidade =
        sorteio < 0.46 ? 'venda' : sorteio < 0.66 ? 'aluguel' : 'temporada';
      const { tipo } = escolherPeso(TIPOS, r);

      const ehTerreno = tipo === 'terreno';
      const areaUtil = ehTerreno
        ? null
        : Math.round(
            (tipo === 'apartamento' ? 60 : tipo === 'pousada' ? 320 : 130) * variacao(r, 0.75),
          );
      const areaTerreno =
        ehTerreno || tipo === 'casa' || tipo === 'pousada'
          ? Math.round((ehTerreno ? 480 : 380) * variacao(r, 0.7))
          : null;

      // Terreno não tem cômodo, e sala comercial não tem quarto nem suíte.
      const temQuartos = tipo === 'casa' || tipo === 'apartamento' || tipo === 'pousada';
      const quartos = temQuartos
        ? Math.max(1, Math.min(8, Math.round((areaUtil ?? 100) / 45 + r() * 1.5)))
        : null;
      const suites = quartos === null ? null : Math.max(0, Math.min(quartos, Math.round(quartos * r())));
      const banheiros = ehTerreno
        ? null
        : quartos === null
          ? 1 + Math.round(r())
          : Math.max(1, quartos - 1 + Math.round(r()));
      const vagas = ehTerreno ? null : Math.max(0, Math.min(6, Math.round((areaUtil ?? 80) / 90)));

      const areaPreco = areaUtil ?? (areaTerreno ?? 400) * 0.28;
      const base =
        finalidade === 'venda'
          ? BASE_VENDA_M2 * (ehTerreno ? 0.42 : 1)
          : finalidade === 'aluguel'
            ? BASE_ALUGUEL_M2
            : BASE_DIARIA_M2;

      const caracteristicas = CARACTERISTICAS.filter((c) => r() < c.prob).map((c) => c.c);
      const bonus =
        1 +
        (caracteristicas.includes('pe-na-areia') ? 0.35 : 0) +
        (caracteristicas.includes('vista-mar') ? 0.14 : 0) +
        (caracteristicas.includes('piscina') ? 0.08 : 0);

      const precoBruto = base * areaPreco * patamar * bonus * variacao(r, 0.45);
      const arredondar =
        finalidade === 'venda' ? 10_000 : finalidade === 'aluguel' ? 100 : 10;
      const preco = Math.max(arredondar, Math.round(precoBruto / arredondar) * arredondar);

      const id = `demo-${bairro.id}-${k}`;
      const pos = posicionar(id, bairro, ix);
      const rotuloTipo =
        tipo === 'casa'
          ? 'Casa'
          : tipo === 'apartamento'
            ? 'Apartamento'
            : tipo === 'terreno'
              ? 'Terreno'
              : tipo === 'pousada'
                ? 'Pousada'
                : 'Sala comercial';
      const complemento = caracteristicas.includes('pe-na-areia')
        ? ' pé na areia'
        : caracteristicas.includes('vista-mar')
          ? ' com vista para o mar'
          : caracteristicas.includes('piscina')
            ? ' com piscina'
            : '';

      const diasAtras = Math.floor(r() * 120);
      const atualizado = new Date(hoje.getTime() - diasAtras * 86_400_000)
        .toISOString()
        .slice(0, 10);

      // Parte dos imóveis aparece em mais de uma corretora, como acontece de verdade.
      const nFontes = r() < 0.22 ? 2 : 1;
      const fontes = Array.from({ length: nFontes }, (_, i) => {
        const c = CORRETORAS_DEMO[(k + i) % CORRETORAS_DEMO.length];
        const ajuste = i === 0 ? 1 : 1 + (r() - 0.35) * 0.06;
        return {
          fonte: c.fonte,
          nomeFonte: c.nome,
          url: `#demo/${id}/${i}`,
          codigo: `EX${1000 + imoveis.length}${i}`,
          preco: Math.round((preco * ajuste) / arredondar) * arredondar,
          coletadoEm: atualizado,
        };
      });
      const precoFinal = Math.min(...fontes.map((f) => f.preco));

      const variou = r() < 0.16;
      imoveis.push({
        id,
        titulo: `${rotuloTipo}${complemento} em ${bairro.nome}`,
        finalidade,
        tipo,
        bairroId: pos.bairroId,
        bairro: pos.bairro,
        setor: pos.setor,
        preco: precoFinal,
        precoM2: calcularPrecoM2(precoFinal, areaUtil),
        condominio:
          tipo === 'apartamento' || caracteristicas.includes('condominio-fechado')
            ? Math.round((350 + r() * 900) / 50) * 50
            : null,
        iptu: finalidade === 'venda' ? Math.round((800 + r() * 4200) / 100) * 100 : null,
        areaUtil,
        areaTerreno,
        quartos,
        suites,
        banheiros,
        vagas,
        caracteristicas,
        descricao: `Registro de demonstração gerado para testar o aplicativo. ${rotuloTipo} em ${bairro.nome}, no setor ${bairro.setor}. Substituído automaticamente pelos anúncios reais na primeira coleta.`,
        fotos: [],
        lat: pos.lat,
        lon: pos.lon,
        precisaoGeo: pos.precisao,
        fontes,
        demo: true,
        atualizadoEm: atualizado,
        variacaoPreco: variou
          ? {
              pct: Math.round((r() * -0.18 - 0.02) * 100) / 100,
              desde: new Date(hoje.getTime() - (diasAtras + 30) * 86_400_000)
                .toISOString()
                .slice(0, 10),
            }
          : null,
        novo: diasAtras <= 7,
        divergenciaFontes: false,
      });
    }
  }
  return imoveis;
}

const imoveis = gerar();
const dataset: Dataset = {
  _leiame:
    'DADOS DE DEMONSTRAÇÃO — valores sintéticos, não são o mercado de Ilhabela. Gerado por scripts/build-demo.ts para o aplicativo poder ser usado antes da primeira coleta. É substituído por data/listings.json assim que o coletor roda.',
  geradoEm: new Date().toISOString().slice(0, 10),
  demo: true,
  imoveis,
  relatorio: null,
};

writeFileSync(path.join(dataDir, 'listings.demo.json'), JSON.stringify(dataset));

const porFinalidade = imoveis.reduce<Record<string, number>>((acc, i) => {
  acc[i.finalidade] = (acc[i.finalidade] ?? 0) + 1;
  return acc;
}, {});
console.log(`semente de demonstração: ${imoveis.length} registros`);
console.log(
  Object.entries(porFinalidade)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n'),
);
