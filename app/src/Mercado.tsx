import { useEffect, useMemo, useRef } from 'react';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import type { EstatisticaZona } from '@core/stats';
import { AMOSTRA_MINIMA, mediana } from '@core/stats';
import { formatarData, formatarPreco, formatarPrecoM2 } from '@core/format';
import type { Dataset, Finalidade, Imovel, Zona } from '@core/types';
import { Modal } from './Ficha';

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
);

Chart.defaults.color = '#8fa39b';
Chart.defaults.font.family = "'Sora', system-ui, sans-serif";
Chart.defaults.font.size = 11;

const CORES = ['#2be0c8', '#7adcb0', '#b9d695', '#e8c97a', '#ff9c5f', '#ff6a4d'];

function useGrafico(
  configurar: () => import('chart.js').ChartConfiguration | null,
  dependencias: unknown[],
) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const config = configurar();
    if (!config) return;
    const grafico = new Chart(canvas, config);
    return () => grafico.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencias);
  return ref;
}

export function PainelMercado(props: {
  dataset: Dataset;
  zonas: Zona[];
  imoveisDoModo: Imovel[];
  estatisticas: Map<string, EstatisticaZona>;
  finalidade: Finalidade;
  aoFechar: () => void;
}) {
  const { dataset, zonas, imoveisDoModo, estatisticas, finalidade } = props;

  const ranking = useMemo(
    () =>
      zonas
        .map((z) => ({ zona: z, est: estatisticas.get(z.id) }))
        .filter((r): r is { zona: Zona; est: EstatisticaZona } => !!r.est?.confiavel && !!r.est.medianaPrecoM2)
        .sort((a, b) => (b.est.medianaPrecoM2 ?? 0) - (a.est.medianaPrecoM2 ?? 0)),
    [zonas, estatisticas],
  );

  const maiorMediana = ranking[0]?.est.medianaPrecoM2 ?? 1;

  // ---- distribuição de preços -------------------------------------------
  const refDistribuicao = useGrafico(() => {
    const precos = imoveisDoModo.map((i) => i.preco).filter((p) => p > 0).sort((a, b) => a - b);
    if (precos.length < 5) return null;

    // Corta o topo em 5% para uma casa de R$ 30 mi não achatar o gráfico inteiro.
    const teto = precos[Math.floor(precos.length * 0.95)];
    const faixas = 14;
    const largura = teto / faixas;
    const contagem = new Array(faixas).fill(0);
    for (const p of precos) contagem[Math.min(faixas - 1, Math.floor(p / largura))]++;

    return {
      type: 'bar',
      data: {
        labels: contagem.map((_, i) => formatarPreco(Math.round(largura * (i + 0.5)), finalidade)),
        datasets: [
          {
            label: 'Anúncios',
            data: contagem,
            backgroundColor: '#2be0c8',
            borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
          y: { grid: { color: '#26332c' }, ticks: { precision: 0 } },
        },
      },
    };
  }, [imoveisDoModo, finalidade]);

  // ---- preço por m² x tamanho -------------------------------------------
  const refTamanho = useGrafico(() => {
    const porFaixa = new Map<string, number[]>();
    const faixas: [string, number, number][] = [
      ['até 80', 0, 80],
      ['80–120', 80, 120],
      ['120–180', 120, 180],
      ['180–250', 180, 250],
      ['250–400', 250, 400],
      ['400+', 400, Infinity],
    ];
    for (const i of imoveisDoModo) {
      if (!i.areaUtil || !i.precoM2) continue;
      const faixa = faixas.find(([, min, max]) => i.areaUtil! >= min && i.areaUtil! < max);
      if (!faixa) continue;
      const lista = porFaixa.get(faixa[0]);
      if (lista) lista.push(i.precoM2);
      else porFaixa.set(faixa[0], [i.precoM2]);
    }
    const rotulos = faixas.map(([r]) => r).filter((r) => (porFaixa.get(r)?.length ?? 0) >= 3);
    if (rotulos.length < 2) return null;

    return {
      type: 'bar',
      data: {
        labels: rotulos,
        datasets: [
          {
            label: 'Mediana R$/m²',
            data: rotulos.map((r) => mediana(porFaixa.get(r) ?? []) ?? 0),
            backgroundColor: rotulos.map((_, i) => CORES[i % CORES.length]),
            borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, title: { display: true, text: 'área construída (m²)' } },
          y: { grid: { color: '#26332c' } },
        },
      },
    };
  }, [imoveisDoModo]);

  // ---- estoque por mês de atualização ------------------------------------
  const refEstoque = useGrafico(() => {
    const porMes = new Map<string, number>();
    for (const i of imoveisDoModo) {
      const mes = i.atualizadoEm.slice(0, 7);
      porMes.set(mes, (porMes.get(mes) ?? 0) + 1);
    }
    const meses = [...porMes.keys()].sort();
    if (meses.length < 2) return null;

    return {
      type: 'line',
      data: {
        labels: meses,
        datasets: [
          {
            label: 'Anúncios atualizados',
            data: meses.map((m) => porMes.get(m) ?? 0),
            borderColor: '#2be0c8',
            backgroundColor: 'rgba(43,224,200,.15)',
            fill: true,
            tension: 0.32,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: '#26332c' }, ticks: { precision: 0 } },
        },
      },
    };
  }, [imoveisDoModo]);

  const relatorio = dataset.relatorio;

  return (
    <Modal
      largo
      titulo="Mercado"
      subtitulo={`${imoveisDoModo.length} anúncios de ${finalidade === 'venda' ? 'venda' : finalidade === 'aluguel' ? 'aluguel anual' : 'temporada'} · base gerada em ${formatarData(dataset.geradoEm)}`}
      aoFechar={props.aoFechar}
    >
      {dataset.demo && (
        <div className="alerta atencao" style={{ marginBottom: 14 }}>
          {/* O texto vai dentro de um span porque .alerta é flex: texto solto e <strong>
              virariam itens de flex separados, quebrando a frase. */}
          <span>
            Estes números vêm da base de <strong>demonstração</strong>. Não são o mercado de
            Ilhabela — servem só para conferir o aplicativo antes da primeira coleta real.
          </span>
        </div>
      )}

      <div className="grade-mercado">
        <div className="bloco largo">
          <h3>Preço por m² por bairro — mediana</h3>
          {ranking.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>
              Nenhum bairro tem {AMOSTRA_MINIMA} anúncios com área informada nesta finalidade. Sem
              isso, qualquer mediana seria ruído.
            </p>
          ) : (
            <div className="ranking">
              {ranking.map(({ zona, est }, indice) => (
                <div className="ranking-linha" key={zona.id}>
                  <span>{zona.nome}</span>
                  <span className="barra">
                    <i
                      style={{
                        width: `${((est.medianaPrecoM2 ?? 0) / maiorMediana) * 100}%`,
                        background: CORES[Math.floor((indice / ranking.length) * CORES.length)],
                      }}
                    />
                  </span>
                  <span className="valor">
                    {formatarPrecoM2(est.medianaPrecoM2, finalidade)}
                    <span style={{ color: 'var(--muted)' }}> · n={est.nComArea}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bloco">
          <h3>Distribuição de preços</h3>
          <div className="tela-grafico">
            <canvas ref={refDistribuicao} />
          </div>
        </div>

        <div className="bloco">
          <h3>Preço por m² conforme o tamanho</h3>
          <div className="tela-grafico">
            <canvas ref={refTamanho} />
          </div>
        </div>

        <div className="bloco largo">
          <h3>Anúncios por mês de atualização</h3>
          <div className="tela-grafico">
            <canvas ref={refEstoque} />
          </div>
        </div>

        <div className="bloco largo">
          <h3>De onde vieram os dados</h3>
          {relatorio ? (
            <table className="tabela-fontes">
              <thead>
                <tr>
                  <th>Fonte</th>
                  <th>Situação</th>
                  <th>Anúncios</th>
                  <th>Observação</th>
                </tr>
              </thead>
              <tbody>
                {relatorio.fontes.map((f) => (
                  <tr key={f.fonte}>
                    <td style={{ fontFamily: 'var(--f-body)' }}>{f.nome}</td>
                    <td>
                      <span className={`estado-fonte ${f.status}`}>{f.status}</span>
                    </td>
                    <td>{f.quantidade}</td>
                    <td style={{ fontFamily: 'var(--f-body)', color: 'var(--muted)' }}>
                      {f.mensagem ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>
              A coleta real ainda não rodou. Quando o coletor executar, esta tabela mostra o que
              cada site entregou, o que falhou e quando.
            </p>
          )}
          {relatorio && (
            <p className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
              {relatorio.totalBruto} anúncios coletados → {relatorio.totalAposDedupe} imóveis
              distintos após juntar repetições.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
