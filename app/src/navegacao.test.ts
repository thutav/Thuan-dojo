import { describe, expect, it } from 'vitest';
import { FILTROS_PADRAO } from './dados';
import { rotaDaUrl, rotaParaUrl, type Rota } from './navegacao';

const base: Rota = { filtros: FILTROS_PADRAO, imovel: null, vista: 'nenhum', aba: 'mapa' };

describe('rota na URL', () => {
  it('não escreve nada quando nada foi aberto nem filtrado', () => {
    expect(rotaParaUrl(base)).toBe('');
  });

  it('leva e traz o imóvel aberto — é o que faz o link de um anúncio funcionar', () => {
    const url = rotaParaUrl({ ...base, imovel: 'abc123' });
    expect(url).toBe('i=abc123');
    expect(rotaDaUrl(url).imovel).toBe('abc123');
  });

  it('leva e traz o modal aberto junto com os filtros', () => {
    const rota: Rota = {
      ...base,
      filtros: { ...FILTROS_PADRAO, finalidade: 'aluguel', quartosMin: 3 },
      vista: 'mercado',
    };
    const volta = rotaDaUrl(rotaParaUrl(rota));
    expect(volta.vista).toBe('mercado');
    expect(volta.filtros.finalidade).toBe('aluguel');
    expect(volta.filtros.quartosMin).toBe(3);
  });

  it('ignora uma vista inventada em vez de abrir um modal que não existe', () => {
    expect(rotaDaUrl('v=administrador').vista).toBe('nenhum');
  });

  it('guarda a aba do celular só quando não é a padrão', () => {
    expect(rotaParaUrl({ ...base, aba: 'mapa' })).toBe('');
    expect(rotaDaUrl(rotaParaUrl({ ...base, aba: 'lista' })).aba).toBe('lista');
  });

  it('a ida e a volta são estáveis: reserializar não muda a URL', () => {
    const url = 'm=aluguel&qt=2&c=vista-mar&i=xyz&v=comparar&aba=lista';
    const primeira = rotaParaUrl(rotaDaUrl(url));
    expect(rotaParaUrl(rotaDaUrl(primeira))).toBe(primeira);
    expect(rotaDaUrl(primeira)).toMatchObject({
      imovel: 'xyz',
      vista: 'comparar',
      aba: 'lista',
    });
  });
});
