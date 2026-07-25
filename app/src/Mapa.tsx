import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import type { EstatisticaZona } from '@core/stats';
import { cortesQuantilicos, estatisticaDaZona, faixaDoValor } from '@core/stats';
import { formatarPreco, formatarPrecoM2 } from '@core/format';
import type { Finalidade, Imovel, OutlineFile, Zona } from '@core/types';

/** Mesma escala definida em styles.css (--q1..--q6): frio = barato, quente = caro. */
const ESCALA = ['#2be0c8', '#7adcb0', '#b9d695', '#e8c97a', '#ff9c5f', '#ff6a4d'];
const SEM_AMOSTRA = '#26332c';

export type Metrica = 'precoM2' | 'preco' | 'n';

export interface MetricaInfo {
  id: Metrica;
  rotulo: string;
  descricao: string;
}

export function metricasDisponiveis(finalidade: Finalidade): MetricaInfo[] {
  const unidade =
    finalidade === 'venda' ? 'R$/m²' : finalidade === 'aluguel' ? 'R$/m² por mês' : 'R$/m² por noite';
  const preco =
    finalidade === 'venda'
      ? 'Preço mediano'
      : finalidade === 'aluguel'
        ? 'Aluguel mediano'
        : 'Diária mediana';
  return [
    {
      id: 'precoM2',
      rotulo: `Preço por m² construído (${unidade})`,
      descricao: 'mediana do bairro, sem terrenos',
    },
    { id: 'preco', rotulo: preco, descricao: 'mediana do bairro' },
    { id: 'n', rotulo: 'Quantidade de ofertas', descricao: 'anúncios no bairro' },
  ];
}

/**
 * Contagem e preço mediano olham o bairro inteiro; o preço por m² olha só os imóveis
 * construídos, porque o m² de terreno é outra grandeza e misturá-los inventaria pechinchas.
 */
function valorDaZona(
  estatisticas: Map<string, EstatisticaZona>,
  bairroId: string,
  metrica: Metrica,
): number | null {
  if (metrica === 'precoM2') {
    const est = estatisticaDaZona(estatisticas, bairroId, 'construido');
    return est?.confiavel ? est.medianaPrecoM2 : null;
  }
  const est = estatisticaDaZona(estatisticas, bairroId);
  if (!est) return null;
  return metrica === 'n' ? est.n || null : est.medianaPreco;
}

function formatarValorMetrica(valor: number, metrica: Metrica, finalidade: Finalidade): string {
  if (metrica === 'n') return `${valor} ${valor === 1 ? 'anúncio' : 'anúncios'}`;
  if (metrica === 'preco') return formatarPreco(valor, finalidade);
  return formatarPrecoM2(valor, finalidade);
}

/** Rótulo curto para o pino: R$ 1,2 mi / R$ 4,5 mil / R$ 350. */
function precoCurto(valor: number): string {
  if (valor >= 1_000_000) return `R$ ${(valor / 1_000_000).toFixed(1).replace('.', ',')}mi`;
  if (valor >= 10_000) return `R$ ${Math.round(valor / 1000)}k`;
  if (valor >= 1_000) return `R$ ${(valor / 1000).toFixed(1).replace('.', ',')}k`;
  return `R$ ${valor}`;
}

export interface PropsMapa {
  outline: OutlineFile;
  zonas: Zona[];
  imoveis: Imovel[];
  estatisticas: Map<string, EstatisticaZona>;
  finalidade: Finalidade;
  metrica: Metrica;
  mostrarZonas: boolean;
  mostrarPinos: boolean;
  usarTiles: boolean;
  destacado: string | null;
  favoritos: Set<string>;
  bairrosSelecionados: string[];
  poligono: [number, number][] | null;
  desenhando: boolean;
  aoSelecionar: (id: string) => void;
  aoDestacar: (id: string | null) => void;
  aoClicarZona: (bairroId: string) => void;
  aoDesenhar: (poligono: [number, number][] | null) => void;
}

export function Mapa(props: PropsMapa) {
  const {
    outline,
    zonas,
    imoveis,
    estatisticas,
    finalidade,
    metrica,
    mostrarZonas,
    mostrarPinos,
    usarTiles,
    destacado,
    favoritos,
    bairrosSelecionados,
    poligono,
    desenhando,
    aoSelecionar,
    aoDestacar,
    aoClicarZona,
    aoDesenhar,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const camadasRef = useRef<{
    base: L.LayerGroup;
    zonas: L.LayerGroup;
    pinos: L.LayerGroup;
    desenho: L.LayerGroup;
    tiles: L.TileLayer | null;
  } | null>(null);
  const [zoom, setZoom] = useState(11);
  const [pontosDesenho, setPontosDesenho] = useState<[number, number][]>([]);

  // O contorno chega em [lon, lat] (GeoJSON) e o Leaflet quer [lat, lon].
  const contorno = useMemo(
    () => ({
      principal: outline.principal.map(([lon, lat]) => [lat, lon] as [number, number]),
      ilhotas: outline.ilhotas.map((r) => r.map(([lon, lat]) => [lat, lon] as [number, number])),
    }),
    [outline],
  );

  const cortes = useMemo(() => {
    const valores = zonas
      .map((z) => valorDaZona(estatisticas, z.id, metrica))
      .filter((v): v is number => v !== null);
    return cortesQuantilicos(valores, ESCALA.length);
  }, [zonas, estatisticas, metrica]);

  // ---- criação do mapa (uma vez) -----------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapaRef.current) return;

    const mapa = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: false,
      minZoom: 10,
      maxZoom: 17,
      // Sem passo fracionário o Leaflet arredonda o enquadramento para baixo e a ilha entra
      // na tela ocupando metade do espaço disponível.
      zoomSnap: 0.25,
    });
    mapaRef.current = mapa;

    camadasRef.current = {
      base: L.layerGroup().addTo(mapa),
      zonas: L.layerGroup().addTo(mapa),
      pinos: L.layerGroup().addTo(mapa),
      desenho: L.layerGroup().addTo(mapa),
      tiles: null,
    };

    mapa.attributionControl.setPrefix('');
    mapa.attributionControl.addAttribution(
      'Contorno: malha municipal do IBGE via geodata-br',
    );

    const limites = L.latLngBounds(contorno.principal);
    mapa.fitBounds(limites, { padding: [24, 24] });
    mapa.setMaxBounds(limites.pad(0.55));
    setZoom(mapa.getZoom());
    mapa.on('zoomend', () => setZoom(mapa.getZoom()));

    const observador = new ResizeObserver(() => mapa.invalidateSize());
    observador.observe(containerRef.current);

    return () => {
      observador.disconnect();
      mapa.remove();
      mapaRef.current = null;
      camadasRef.current = null;
    };
  }, [contorno]);

  // ---- base vetorial da ilha ---------------------------------------------
  useEffect(() => {
    const camadas = camadasRef.current;
    if (!camadas) return;
    camadas.base.clearLayers();

    // Halo suave em volta da costa: dá relevo sem depender de tiles externos.
    L.polygon(contorno.principal, {
      color: '#2be0c8',
      weight: 9,
      opacity: 0.07,
      fill: false,
      interactive: false,
    }).addTo(camadas.base);

    L.polygon(contorno.principal, {
      color: '#4d8375',
      weight: 1.5,
      opacity: 0.95,
      fillColor: '#16241f',
      fillOpacity: 1,
      interactive: false,
    }).addTo(camadas.base);

    for (const ilhota of contorno.ilhotas) {
      L.polygon(ilhota, {
        color: '#4d8375',
        weight: 1.1,
        opacity: 0.7,
        fillColor: '#16241f',
        fillOpacity: 1,
        interactive: false,
      }).addTo(camadas.base);
    }
  }, [contorno]);

  // ---- tiles opcionais ----------------------------------------------------
  useEffect(() => {
    const mapa = mapaRef.current;
    const camadas = camadasRef.current;
    if (!mapa || !camadas) return;

    if (usarTiles && !camadas.tiles) {
      camadas.tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        opacity: 0.55,
        attribution: '&copy; OpenStreetMap',
      });
      camadas.tiles.addTo(mapa);
      camadas.tiles.bringToBack();
    } else if (!usarTiles && camadas.tiles) {
      mapa.removeLayer(camadas.tiles);
      camadas.tiles = null;
    }
  }, [usarTiles]);

  // ---- coroplético --------------------------------------------------------
  useEffect(() => {
    const camadas = camadasRef.current;
    if (!camadas) return;
    camadas.zonas.clearLayers();
    if (!mostrarZonas) return;

    for (const zona of zonas) {
      const est = estatisticaDaZona(estatisticas, zona.id);
      // A faixa por m² na dica vem do recorte construído, igual à cor da zona.
      const estConstruido = estatisticaDaZona(estatisticas, zona.id, 'construido');
      const valor = valorDaZona(estatisticas, zona.id, metrica);
      const selecionada = bairrosSelecionados.includes(zona.id);
      const temValor = valor !== null;
      const cor = temValor ? ESCALA[Math.min(faixaDoValor(valor, cortes), ESCALA.length - 1)] : SEM_AMOSTRA;

      const camada = L.polygon(zona.poligono, {
        color: selecionada ? '#ffffff' : cor,
        weight: selecionada ? 2 : 0.8,
        opacity: temValor ? 0.85 : 0.5,
        fillColor: cor,
        fillOpacity: temValor ? 0.5 : 0.14,
        className: temValor ? undefined : 'zona-sem-amostra',
      });

      const linhas: string[] = [];
      if (temValor) {
        linhas.push(
          `<dt>${metrica === 'n' ? 'Ofertas' : 'Mediana'}</dt><dd>${formatarValorMetrica(valor, metrica, finalidade)}</dd>`,
        );
      }
      if (est) {
        linhas.push(`<dt>Anúncios</dt><dd>${est.n}</dd>`);
        if (estConstruido?.confiavel && estConstruido.q1PrecoM2 && estConstruido.q3PrecoM2) {
          linhas.push(
            `<dt>Faixa por m²</dt><dd>${formatarPrecoM2(estConstruido.q1PrecoM2, finalidade)} – ${formatarPrecoM2(estConstruido.q3PrecoM2, finalidade)}</dd>`,
          );
        } else if (metrica === 'precoM2') {
          linhas.push('<dt>Preço por m²</dt><dd>amostra insuficiente</dd>');
        }
      } else {
        linhas.push('<dt>Anúncios</dt><dd>nenhum</dd>');
      }

      camada.bindTooltip(
        `<div class="dica-zona"><h4>${zona.nome}</h4><dl>${linhas.join('')}</dl></div>`,
        { className: 'tooltip-zona', sticky: true, direction: 'top', opacity: 1 },
      );

      camada.on('mouseover', () => camada.setStyle({ fillOpacity: temValor ? 0.68 : 0.28, weight: 2 }));
      camada.on('mouseout', () =>
        camada.setStyle({ fillOpacity: temValor ? 0.5 : 0.14, weight: selecionada ? 2 : 0.8 }),
      );
      camada.on('click', () => aoClicarZona(zona.id));
      camada.addTo(camadas.zonas);
    }
  }, [zonas, estatisticas, metrica, cortes, mostrarZonas, bairrosSelecionados, finalidade, aoClicarZona]);

  // ---- pinos --------------------------------------------------------------
  useEffect(() => {
    const camadas = camadasRef.current;
    if (!camadas) return;
    camadas.pinos.clearLayers();
    if (!mostrarPinos) return;

    // Agrupamento por célula: sem isso, o miolo urbano vira uma mancha de rótulos.
    const celula =
      zoom >= 15 ? 0 : zoom >= 14 ? 0.0016 : zoom >= 13 ? 0.0035 : zoom >= 12 ? 0.009 : 0.028;
    const grupos = new Map<string, Imovel[]>();
    for (const im of imoveis) {
      const chave =
        celula === 0
          ? im.id
          : `${Math.round(im.lat / celula)}:${Math.round(im.lon / celula)}`;
      const g = grupos.get(chave);
      if (g) g.push(im);
      else grupos.set(chave, [im]);
    }

    for (const grupo of grupos.values()) {
      if (grupo.length === 1) {
        const im = grupo[0];
        const ativo = destacado === im.id;
        const classe = ['pino-preco', ativo ? 'ativo' : '', favoritos.has(im.id) ? 'favorito' : '']
          .filter(Boolean)
          .join(' ');
        const marcador = L.marker([im.lat, im.lon], {
          icon: L.divIcon({
            className: '',
            html: `<div class="${classe}">${precoCurto(im.preco)}</div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
          keyboard: false,
          zIndexOffset: ativo ? 1000 : 0,
        });
        marcador.on('click', () => aoSelecionar(im.id));
        marcador.on('mouseover', () => aoDestacar(im.id));
        marcador.on('mouseout', () => aoDestacar(null));
        marcador.addTo(camadas.pinos);
      } else {
        const lat = grupo.reduce((s, i) => s + i.lat, 0) / grupo.length;
        const lon = grupo.reduce((s, i) => s + i.lon, 0) / grupo.length;
        // Com a ilha inteira na tela, o que interessa é a cor das zonas; os agrupamentos
        // ficam discretos e só ganham corpo quando a pessoa se aproxima de um bairro.
        const longe = zoom <= 12;
        const tamanho = longe
          ? grupo.length > 40
            ? 32
            : 26
          : grupo.length > 40
            ? 46
            : grupo.length > 12
              ? 40
              : 32;
        const marcador = L.marker([lat, lon], {
          icon: L.divIcon({
            className: '',
            html: `<div class="pino-grupo${longe ? ' discreto' : ''}" style="width:${tamanho}px;height:${tamanho}px">${grupo.length}</div>`,
            iconSize: [tamanho, tamanho],
            iconAnchor: [tamanho / 2, tamanho / 2],
          }),
          keyboard: false,
        });
        marcador.bindTooltip(`${grupo.length} anúncios — aproxime para abrir`, {
          direction: 'top',
          className: 'tooltip-zona',
        });
        marcador.on('click', () => {
          const mapa = mapaRef.current;
          if (mapa) mapa.flyTo([lat, lon], Math.min(mapa.getZoom() + 2, 16), { duration: 0.5 });
        });
        marcador.addTo(camadas.pinos);
      }
    }
  }, [imoveis, zoom, mostrarPinos, destacado, favoritos, aoSelecionar, aoDestacar]);

  // ---- desenho de área ----------------------------------------------------
  const finalizarDesenho = useCallback(() => {
    if (pontosDesenho.length >= 3) aoDesenhar(pontosDesenho);
    else aoDesenhar(null);
    setPontosDesenho([]);
  }, [pontosDesenho, aoDesenhar]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;

    const aoClicar = (e: L.LeafletMouseEvent) => {
      if (!desenhando) return;
      setPontosDesenho((atual) => [...atual, [e.latlng.lat, e.latlng.lng]]);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (!desenhando) return;
      if (e.key === 'Enter') finalizarDesenho();
      if (e.key === 'Escape') {
        setPontosDesenho([]);
        aoDesenhar(null);
      }
    };

    mapa.on('click', aoClicar);
    mapa.on('dblclick', finalizarDesenho);
    addEventListener('keydown', aoTeclar);
    const container = mapa.getContainer();
    container.style.cursor = desenhando ? 'crosshair' : '';
    if (desenhando) mapa.doubleClickZoom.disable();
    else mapa.doubleClickZoom.enable();

    return () => {
      mapa.off('click', aoClicar);
      mapa.off('dblclick', finalizarDesenho);
      removeEventListener('keydown', aoTeclar);
    };
  }, [desenhando, finalizarDesenho, aoDesenhar]);

  useEffect(() => {
    const camadas = camadasRef.current;
    if (!camadas) return;
    camadas.desenho.clearLayers();

    if (poligono && !desenhando) {
      L.polygon(poligono, {
        color: '#2be0c8',
        weight: 2,
        dashArray: '6 4',
        fillColor: '#2be0c8',
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(camadas.desenho);
    }

    if (desenhando && pontosDesenho.length) {
      L.polyline([...pontosDesenho, ...(pontosDesenho.length > 2 ? [pontosDesenho[0]] : [])], {
        color: '#2be0c8',
        weight: 2,
        dashArray: '5 4',
        interactive: false,
      }).addTo(camadas.desenho);
      for (const p of pontosDesenho) {
        L.circleMarker(p, {
          radius: 4,
          color: '#2be0c8',
          fillColor: '#0b0f0e',
          fillOpacity: 1,
          weight: 2,
          interactive: false,
        }).addTo(camadas.desenho);
      }
    }
  }, [poligono, pontosDesenho, desenhando]);

  const metricaAtual = metricasDisponiveis(finalidade).find((m) => m.id === metrica);
  const valores = zonas
    .map((z) => valorDaZona(estatisticas, z.id, metrica))
    .filter((v): v is number => v !== null);
  const minimo = valores.length ? Math.min(...valores) : null;
  const maximo = valores.length ? Math.max(...valores) : null;

  return (
    <>
      <div className="mapa" ref={containerRef} role="application" aria-label="Mapa de Ilhabela" />

      {desenhando && (
        <div className="painel-mapa" style={{ top: 12, left: 12, padding: '10px 13px', zIndex: 600 }}>
          <div className="mono" style={{ fontSize: 12 }}>
            Clique para marcar os cantos da área · <strong>Enter</strong> fecha ·{' '}
            <strong>Esc</strong> cancela
          </div>
        </div>
      )}

      {mostrarZonas && (
        <div className="painel-mapa legenda">
          <div className="titulo-legenda">{metricaAtual?.rotulo ?? 'Escala'}</div>
          <div className="escala" aria-hidden="true">
            {ESCALA.map((cor) => (
              <span key={cor} style={{ background: cor }} />
            ))}
          </div>
          <div className="escala-rotulos">
            <span>{minimo !== null ? formatarValorMetrica(minimo, metrica, finalidade) : '—'}</span>
            <span>{maximo !== null ? formatarValorMetrica(maximo, metrica, finalidade) : '—'}</span>
          </div>
          <div className="nota">
            <span className="amostra-fraca" aria-hidden="true" />
            <span>
              {metrica === 'n'
                ? 'sem anúncios no bairro'
                : 'amostra insuficiente (menos de 5 anúncios)'}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
