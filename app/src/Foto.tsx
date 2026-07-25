import { useEffect, useState } from 'react';
import { IconeCasa } from './icones';

/**
 * As fotos são servidas pelos próprios sites das corretoras. Link quebrado, hotlink barrado
 * ou anúncio removido acontecem o tempo todo — e um quadro cinza com o ícone da casa é
 * melhor do que o retângulo de imagem quebrada do navegador.
 */
export function Foto(props: {
  src?: string;
  alt: string;
  tamanhoIcone?: number;
  className?: string;
  eager?: boolean;
}) {
  const [falhou, setFalhou] = useState(false);

  // Trocar de imóvel reaproveita o componente: sem isto, o erro da foto anterior gruda.
  useEffect(() => setFalhou(false), [props.src]);

  if (!props.src || falhou) {
    return (
      <div className={`sem-foto ${props.className ?? ''}`} aria-hidden="true">
        <IconeCasa tamanho={props.tamanhoIcone ?? 26} />
      </div>
    );
  }

  return (
    <img
      className={props.className}
      src={props.src}
      alt={props.alt}
      loading={props.eager ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFalhou(true)}
    />
  );
}
