import { useCallback, useEffect, useRef, useState } from 'react';
import type { Filtros } from './dados';
import { filtrosDaUrl, filtrosParaUrl } from './estado';

/**
 * Tudo que a pessoa "abriu" mora na URL: os filtros, a ficha do imóvel, o modal e — no
 * celular — se ela está vendo a lista ou o mapa. Sem isso o botão voltar do navegador (e o
 * gesto de voltar do Android, que é o mesmo evento) fecha o aplicativo inteiro em vez de
 * fechar a ficha, que é o que qualquer pessoa espera.
 *
 * De quebra, a ficha vira endereço: dá para mandar o link de um imóvel específico.
 */
export type Vista = 'nenhum' | 'filtros' | 'comparar' | 'colar' | 'mercado';
export type Aba = 'mapa' | 'lista';

export interface Rota {
  filtros: Filtros;
  /** id do imóvel com a ficha aberta. */
  imovel: string | null;
  vista: Vista;
  aba: Aba;
}

/**
 * A diferença entre as duas é o que o botão voltar vai fazer:
 *
 * - `empilhar` cria um passo de volta. Use quando a ação *abre* alguma coisa que precisa ser
 *   fechada: ficha, modal, seleção de bairro no mapa, troca de modo.
 * - `trocar` reescreve o passo atual. Use no que é refinamento contínuo: digitar na busca,
 *   arrastar um controle, ligar um chip que a própria pessoa desliga clicando de novo.
 *
 * Empilhar tudo encheria o histórico de lixo — voltar dez vezes para sair de uma busca é tão
 * ruim quanto não poder voltar nenhuma.
 */
export type ModoNavegacao = 'empilhar' | 'trocar';

const VISTAS: Vista[] = ['filtros', 'comparar', 'colar', 'mercado'];

export function rotaDaUrl(busca: string): Rota {
  const p = new URLSearchParams(busca);
  const v = p.get('v');
  return {
    filtros: filtrosDaUrl(busca),
    imovel: p.get('i'),
    vista: v && (VISTAS as string[]).includes(v) ? (v as Vista) : 'nenhum',
    aba: p.get('aba') === 'lista' ? 'lista' : 'mapa',
  };
}

export function rotaParaUrl(r: Rota): string {
  const p = new URLSearchParams(filtrosParaUrl(r.filtros));
  if (r.imovel) p.set('i', r.imovel);
  if (r.vista !== 'nenhum') p.set('v', r.vista);
  if (r.aba !== 'mapa') p.set('aba', r.aba);
  return p.toString();
}

/**
 * Quantos passos desta sessão do aplicativo existem atrás do passo atual. Serve para decidir
 * se `voltar()` pode chamar o histórico do navegador ou se isso jogaria a pessoa para fora
 * do site — o caso de quem chegou por um link direto de imóvel.
 */
function profundidade(): number {
  const s = history.state as { prof?: number } | null;
  return typeof s?.prof === 'number' ? s.prof : 0;
}

function url(busca: string): string {
  return busca ? `${location.pathname}?${busca}` : location.pathname;
}

export interface Navegacao {
  rota: Rota;
  /** Muda a rota. Recebe os campos alterados ou uma função sobre a rota atual. */
  navegar: (
    mudanca: Partial<Rota> | ((r: Rota) => Partial<Rota>),
    modo?: ModoNavegacao,
  ) => void;
  /**
   * Fecha o que está aberto pelo caminho de volta do navegador, quando existe um.
   *
   * `aplicar` é para o que a pessoa decidiu *dentro* do que está fechando — os filtros do
   * modal de filtros. Sem isso a escolha se perderia: voltar leva ao passo anterior, e o
   * passo anterior é justamente o de antes de ela escolher.
   */
  voltar: (aplicar?: Partial<Rota>) => void;
}

export function useNavegacao(): Navegacao {
  const [rota, setRota] = useState<Rota>(() => rotaDaUrl(location.search));
  const rotaRef = useRef(rota);
  rotaRef.current = rota;

  // Marca o passo de entrada. Sem essa marca não dá para distinguir "cheguei agora" de
  // "já naveguei aqui dentro", e `voltar()` acabaria levando a pessoa para fora do site.
  useEffect(() => {
    if (history.state === null || (history.state as { prof?: number }).prof === undefined) {
      history.replaceState({ prof: 0 }, '', url(rotaParaUrl(rotaRef.current)));
    }
  }, []);

  /** O que `voltar(aplicar)` deixou para ser aplicado no passo em que o histórico cair. */
  const pendenteRef = useRef<Partial<Rota> | null>(null);

  useEffect(() => {
    const aoVoltar = () => {
      const chegada = rotaDaUrl(location.search);
      const pendente = pendenteRef.current;
      pendenteRef.current = null;

      const proxima = pendente ? { ...chegada, ...pendente } : chegada;
      rotaRef.current = proxima;
      setRota(proxima);

      if (pendente) {
        history.replaceState({ prof: profundidade() }, '', url(rotaParaUrl(proxima)));
      }
    };
    addEventListener('popstate', aoVoltar);
    return () => removeEventListener('popstate', aoVoltar);
  }, []);

  const navegar = useCallback(
    (
      mudanca: Partial<Rota> | ((r: Rota) => Partial<Rota>),
      modo: ModoNavegacao = 'trocar',
    ) => {
      const atual = rotaRef.current;
      const proxima: Rota = {
        ...atual,
        ...(typeof mudanca === 'function' ? mudanca(atual) : mudanca),
      };
      const busca = rotaParaUrl(proxima);
      if (busca === rotaParaUrl(atual)) return;

      rotaRef.current = proxima;
      setRota(proxima);

      if (modo === 'empilhar') {
        history.pushState({ prof: profundidade() + 1 }, '', url(busca));
      } else {
        history.replaceState({ prof: profundidade() }, '', url(busca));
      }
    },
    [],
  );

  /**
   * Fechar pelo X e voltar pelo navegador têm que dar no mesmo lugar. Por isso o X também
   * anda para trás no histórico em vez de só apagar o estado: se ele apagasse, o passo
   * continuaria empilhado e o botão voltar reabriria a ficha que a pessoa acabou de fechar.
   */
  const voltar = useCallback(
    (aplicar?: Partial<Rota>) => {
      if (profundidade() > 0) {
        pendenteRef.current = aplicar ?? null;
        history.back();
        return;
      }
      // Chegou por link direto: não há para onde voltar, então limpa o que está aberto.
      navegar({ imovel: null, vista: 'nenhum', ...aplicar }, 'trocar');
    },
    [navegar],
  );

  return { rota, navegar, voltar };
}
