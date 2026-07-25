import { describe, expect, it } from 'vitest';
import { parseAnuncioColado, separarAnuncios } from './paste';

describe('parseAnuncioColado', () => {
  it('lê um post de grupo de Facebook de venda', () => {
    const post = `VENDO CASA NO CURRAL 🏖️
Casa com 3 quartos sendo 2 suítes, 2 banheiros, área construída de 180 m² em terreno de 450 m².
Piscina, churrasqueira e vista para o mar. Condomínio fechado com portaria 24h.
Valor: R$ 1.850.000
IPTU R$ 2.400 por ano
Contato (12) 99123-4567`;

    const r = parseAnuncioColado(post);
    expect(r.finalidade).toBe('venda');
    expect(r.tipo).toBe('casa');
    expect(r.preco).toBe(1_850_000);
    expect(r.iptu).toBe(2_400);
    expect(r.quartos).toBe(3);
    expect(r.suites).toBe(2);
    expect(r.banheiros).toBe(2);
    expect(r.areaUtil).toBe(180);
    expect(r.areaTerreno).toBe(450);
    expect(r.telefone).toBe('(12) 99123-4567');
    expect(r.caracteristicas).toEqual(
      expect.arrayContaining(['piscina', 'churrasqueira', 'vista-mar', 'condominio-fechado']),
    );
    expect(r.titulo).toContain('CURRAL');
  });

  it('separa área construída de terreno nas duas ordens de escrita', () => {
    const rotuloDepois = parseAnuncioColado(
      'Casa no Curral com 180 m² de área construída em terreno de 450 m². R$ 1.500.000',
    );
    expect(rotuloDepois.areaUtil).toBe(180);
    expect(rotuloDepois.areaTerreno).toBe(450);

    const rotuloAntes = parseAnuncioColado(
      'Casa no Curral, área construída de 180 m², terreno de 450 m². R$ 1.500.000',
    );
    expect(rotuloAntes.areaUtil).toBe(180);
    expect(rotuloAntes.areaTerreno).toBe(450);
  });

  it('não confunde condomínio com o aluguel', () => {
    const post = `Aluguel anual em Itaguaçu
Apartamento 2 dormitórios, 70 m², mobiliado.
Aluguel R$ 3.200 por mês + condomínio R$ 650`;

    const r = parseAnuncioColado(post);
    expect(r.finalidade).toBe('aluguel');
    expect(r.tipo).toBe('apartamento');
    expect(r.preco).toBe(3_200);
    expect(r.condominio).toBe(650);
    expect(r.areaUtil).toBe(70);
  });

  it('pega a diária, não o pacote, em anúncio de temporada', () => {
    const post = `Casa para temporada na Praia Grande
4 quartos, acomoda 10 pessoas, piscina.
Diária R$ 900. Pacote de réveillon R$ 12.000 (7 noites).`;

    const r = parseAnuncioColado(post);
    expect(r.finalidade).toBe('temporada');
    expect(r.preco).toBe(900);
    expect(r.quartos).toBe(4);
  });

  it('separa vários posts colados de uma vez', () => {
    const lote = `VENDO CASA NO CURRAL
3 quartos, 180 m². R$ 1.850.000

Apartamento no Perequê
2 dormitórios, 70 m². R$ 620.000
Contato (12) 99999-0000

-----

Terreno em Barra Velha, 500 m². R$ 480.000`;

    const blocos = separarAnuncios(lote);
    expect(blocos).toHaveLength(3);
    expect(parseAnuncioColado(blocos[0]).preco).toBe(1_850_000);
    expect(parseAnuncioColado(blocos[1]).preco).toBe(620_000);
    expect(parseAnuncioColado(blocos[2]).preco).toBe(480_000);
  });

  it('gruda no anúncio anterior a linha solta que veio depois dele', () => {
    const lote = `Casa no Julião, 150 m². R$ 900.000

Aceito proposta, falar com Maria`;
    const blocos = separarAnuncios(lote);
    expect(blocos).toHaveLength(1);
    expect(blocos[0]).toContain('Aceito proposta');
  });

  it('um post só continua sendo um post só', () => {
    const post = `VENDO CASA NO CURRAL

Casa com 3 quartos, 180 m².

Valor: R$ 1.850.000`;
    expect(separarAnuncios(post)).toHaveLength(1);
  });

  it('devolve campos nulos quando o texto não informa, sem inventar', () => {
    const r = parseAnuncioColado('Imóvel em Ilhabela, valor sob consulta.');
    expect(r.preco).toBeNull();
    expect(r.quartos).toBeNull();
    expect(r.areaUtil).toBeNull();
    expect(r.camposDetectados).not.toContain('preco');
  });
});
