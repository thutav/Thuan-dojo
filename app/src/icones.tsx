/** Ícones desenhados à mão: sem biblioteca externa e sem requisição de rede. */

interface Props {
  tamanho?: number;
}

const base = (tamanho: number) => ({
  width: tamanho,
  height: tamanho,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export function IconeLupa({ tamanho = 16 }: Props) {
  return (
    <svg {...base(tamanho)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function IconeCasa({ tamanho = 18 }: Props) {
  return (
    <svg {...base(tamanho)}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

export function IconeCoracao({ tamanho = 15, preenchido = false }: Props & { preenchido?: boolean }) {
  return (
    <svg {...base(tamanho)} fill={preenchido ? 'currentColor' : 'none'}>
      <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z" />
    </svg>
  );
}

export function IconeComparar({ tamanho = 15 }: Props) {
  return (
    <svg {...base(tamanho)}>
      <path d="M6 4v16M18 4v16" />
      <path d="M6 9h12M6 15h12" />
    </svg>
  );
}

export function IconeMapa({ tamanho = 15 }: Props) {
  return (
    <svg {...base(tamanho)}>
      <path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  );
}

export function IconeGrafico({ tamanho = 15 }: Props) {
  return (
    <svg {...base(tamanho)}>
      <path d="M4 20h16" />
      <path d="M7 20v-7M12 20V6M17 20v-4" />
    </svg>
  );
}

export function IconeColar({ tamanho = 15 }: Props) {
  return (
    <svg {...base(tamanho)}>
      <rect x="7" y="4" width="10" height="4" rx="1.2" />
      <path d="M9 6H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-3" />
      <path d="M9 13h6M9 16.5h4" />
    </svg>
  );
}

export function IconeFechar({ tamanho = 16 }: Props) {
  return (
    <svg {...base(tamanho)}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function IconeDesenhar({ tamanho = 15 }: Props) {
  return (
    <svg {...base(tamanho)}>
      <path d="M5 17.5 17 5.5a2.1 2.1 0 0 1 3 3L8 20.5 4 21z" />
    </svg>
  );
}

export function IconeAlerta({ tamanho = 16 }: Props) {
  return (
    <svg {...base(tamanho)}>
      <path d="M12 4.5 21 20H3z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}

export function IconeLink({ tamanho = 13 }: Props) {
  return (
    <svg {...base(tamanho)}>
      <path d="M10 13a4 4 0 0 0 5.7.4l3-3A4 4 0 0 0 13 4.8l-1.7 1.7" />
      <path d="M14 11a4 4 0 0 0-5.7-.4l-3 3A4 4 0 0 0 11 19.2l1.7-1.7" />
    </svg>
  );
}

/** Marca do aplicativo: a silhueta da ilha em traço, sobre o gradiente da casa. */
export function Simbolo({ tamanho = 26 }: Props) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="marca-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2BE0C8" />
          <stop offset="100%" stopColor="#FF6A4D" />
        </linearGradient>
      </defs>
      <path
        d="M16 3.5c5.2 0 9.5 3.6 10.8 8.4 1 3.8-.4 7.6-3.3 10.6-2.2 2.3-4.6 4.2-6.4 5.6a1.8 1.8 0 0 1-2.2 0c-1.8-1.4-4.2-3.3-6.4-5.6-2.9-3-4.3-6.8-3.3-10.6C6.5 7.1 10.8 3.5 16 3.5z"
        fill="url(#marca-grad)"
        opacity="0.16"
      />
      <path
        d="M16 4.6c4.7 0 8.6 3.2 9.7 7.6.9 3.4-.4 6.8-3 9.5-2 2.1-4.2 3.8-5.8 5.1a1.5 1.5 0 0 1-1.8 0c-1.6-1.3-3.8-3-5.8-5.1-2.6-2.7-3.9-6.1-3-9.5C7.4 7.8 11.3 4.6 16 4.6z"
        stroke="url(#marca-grad)"
        strokeWidth="1.6"
        fill="none"
      />
      <path d="M11 16.5 16 12l5 4.5V21a.8.8 0 0 1-.8.8h-8.4a.8.8 0 0 1-.8-.8z" fill="#2BE0C8" />
    </svg>
  );
}
