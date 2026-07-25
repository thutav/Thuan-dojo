import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { App } from './App';

const raiz = document.getElementById('root');
if (!raiz) throw new Error('Elemento #root não encontrado');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// O aplicativo é usado dentro do carro, na fila da balsa e em praia sem sinal — o service
// worker guarda o casco e os dados para a busca continuar funcionando offline.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* sem service worker o aplicativo funciona igual, só perde o modo offline */
    });
  });
}
