# Ilhabela Imóveis

Agregador dos anúncios de imóveis de Ilhabela — venda, aluguel anual e temporada — em um
mapa único, com preço por metro quadrado por bairro, filtros de verdade e comparação entre
anúncios repetidos.

O problema que ele resolve: hoje a oferta da ilha está espalhada por meia dúzia de sites de
imobiliária, três portais grandes e grupos de Facebook e WhatsApp. Cada um com um formato,
nenhum com preço por m², nenhum com mapa, e o mesmo imóvel aparecendo em três vitrines por
preços diferentes.

- **Aplicativo:** `https://thutav.github.io/Thuan-dojo/ilhabela/`
- **Proposta do Dojo Fitness Club** (o que já existia no repositório): continua em `index.html`, na raiz, intocada.

---

## O que ele faz

**Mapa da ilha desenhado a partir da malha municipal do IBGE.** Não depende de tiles
externos: funciona sem internet depois de aberto uma vez. O mapa de ruas do OpenStreetMap
entra como camada opcional, no botão "Ruas".

**Coroplético de preço por bairro**, com métrica selecionável (preço por m², preço mediano,
quantidade de ofertas) e escala quantílica. Bairro com menos de 5 anúncios aparece hachurado,
sem número — mediana de amostra pequena é ruído, e ruído apresentado como "preço do bairro"
é pior do que não dizer nada.

**Três modos** — Comprar, Alugar, Temporada — que trocam a semântica do preço (total, mensal,
diária) e recalculam o mapa inteiro.

**Deal score.** Cada imóvel é comparado com a mediana do próprio bairro para o mesmo tipo e
finalidade: "21% abaixo da mediana do bairro". Só aparece quando a zona tem amostra
suficiente.

**Deduplicação entre fontes.** O mesmo imóvel anunciado por três corretoras vira um card com
três fontes e o menor preço em destaque. Quando as fontes divergem em mais de 15%, a ficha
avisa em vez de esconder a diferença na média.

**Colar anúncio.** Grupo de Facebook e WhatsApp não têm API, e raspar essas plataformas
violaria os termos delas. Então: você cola o texto do post, o parser separa preço, área,
quartos, suítes, vagas, bairro, características e telefone, você confere e salva. O anúncio
fica no seu navegador e entra nas buscas, no mapa e nas estatísticas como qualquer outro.

**Alertas.** As buscas que você quer acompanhar ficam em
[`data/alertas.json`](data/alertas.json). A cada coleta, o que entrar novo ou baixar de preço
dentro de uma delas vira uma issue no repositório — e o GitHub manda o e-mail. Sem servidor
de e-mail, sem senha guardada, sem serviço externo. Os favoritos ficam no seu navegador, então
o alerta acompanha buscas, não favoritos.

Além disso: filtros por preço, área, quartos, suítes, vagas, tipo, características, região e
bairro; desenho de área à mão sobre o mapa; favoritos; comparador de até 4 imóveis lado a
lado; painel de mercado com ranking de bairros, distribuição de preços e procedência dos
dados; estado da busca na URL para compartilhar; instalável como aplicativo no celular.

**Duas decisões que mudam os números.** Terreno e imóvel construído nunca entram na mesma
mediana de preço por m² — são grandezas diferentes por uma ordem de magnitude, e misturá-las
faz todo terreno parecer uma pechincha. E a deduplicação exige área ou preço batendo: título
parecido não basta, porque uma corretora publica dezenas de "Terreno em Ilhabela" sem
metragem, e juntá-los apagaria imóveis reais.

---

## Como os dados chegam

```
GitHub Actions (de 6 em 6 horas)
      │
      ├── adapters ──► extratores (JSON-LD → heurística de vitrine)
      │                      │
      │                      ▼
      │              normalizar · geocodificar · deduplicar · comparar com a coleta anterior
      │                      │
      │                      ▼
      └────────────► data/listings.json  (commitado no repositório)
                             │
                             ▼
                    GitHub Pages ──► aplicativo em /ilhabela
```

O front-end é estático e nunca faz requisição a terceiros: sem CORS, sem chave de API, sem
servidor e sem custo.

### Fontes

| Fonte | Como é lida |
| --- | --- |
| Sérgio Hette, Capital Litoral, Studio Trilha, Alessandra Bidoia, Ilhabela Imóveis | HTML direto. Tenta JSON-LD (schema.org); sem isso, heurística de vitrine |
| Capital da Vela | Chromium: a lista é montada por JavaScript |
| VivaReal, Zap, Imovelweb, OLX, Chaves na Mão, Lopes, Agente Imóvel, Wimoveis | Chromium de verdade — estes portais respondem 403 a requisição simples |
| Facebook, WhatsApp, anúncios avulsos | "Colar anúncio", dentro do próprio aplicativo |

Quando a vitrine não diz o bairro — e a maioria não diz, só "Casa em Ilhabela" —, o coletor
abre a ficha do imóvel e lê de lá, com teto por execução.

Nenhum adapter depende de seletor CSS escrito à mão. O extrator tenta primeiro os dados
estruturados que o site publica e, quando não há, lê os blocos que repetem "R$" com um link —
o que sobrevive melhor a redesenho do que uma lista de classes.

---

## Rodando

```bash
npm install

npm run dev          # aplicativo em desenvolvimento
npm test             # 79 testes: parsers, extratores, geocodificação, deduplicação, estatísticas, alertas
npm run build        # gera ilhabela/ (o que o GitHub Pages publica)

npm run build:geo    # regenera o contorno da ilha e as zonas de bairro
npm run build:demo   # regenera a semente de demonstração
npm run ingest       # coleta de verdade — precisa de internet
npm run alertas      # avalia data/alertas.json contra a última coleta
npm run verify:ui    # abre o app no Chromium e confere os caminhos principais
```

Opções do coletor:

```bash
npm run ingest -- --fixtures            # pipeline inteiro sobre páginas de exemplo, sem rede
npm run ingest -- --seco                # coleta de verdade, mas não grava
npm run ingest -- --sem-navegador       # pula os portais que exigem Chromium
npm run ingest -- --somente=sergiohette,capitallitoral
```

---

## Dados de demonstração

Enquanto `data/listings.json` não existir, o aplicativo usa `data/listings.demo.json`: 501
registros **sintéticos**, gerados por `scripts/build-demo.ts`. Eles existem para o aplicativo
poder ser usado e conferido antes da primeira coleta, e nada além disso — cada registro tem
`demo: true`, cada card mostra o selo "demo", há um aviso fixo no topo e o painel de mercado
repete o alerta. Não são o mercado de Ilhabela. Somem sozinhos assim que a coleta real roda.

---

## Ajustando o mapa

Bairros, apelidos usados nos anúncios e a posição de cada zona ficam num arquivo só:
[`data/gazetteer.json`](data/gazetteer.json). Para corrigir a posição de um bairro, incluir
outro ou ensinar um apelido novo ao geocodificador, edite lá e rode `npm run build:geo`.

As coordenadas são âncoras de bairro, não endereços. O aplicativo diz isso na ficha de cada
imóvel: quando o anúncio informa só o bairro, o pino fica dentro do bairro sem apontar a casa,
e o card marca "aprox.".

As zonas são geradas por Voronoi sobre essas âncoras, recortadas pelo contorno da ilha e
limitadas a 2,5 km de cada âncora — cobrem a faixa costeira habitada, não o Parque Estadual
que ocupa o miolo da ilha e não tem imóvel à venda.

---

## Estrutura

```
index.html            proposta do Dojo Fitness Club (o que já existia)
ilhabela/             build publicado do aplicativo
app/                  fonte do front-end (Vite + React + TypeScript)
core/                 tipos, parsers, geocodificação, deduplicação e estatísticas
                      — compartilhados entre o coletor e o navegador
ingest/               coletor: adapters, extratores, pipeline e fixtures de teste
scripts/              geração da base geográfica, da semente demo e verificação da interface
data/                 gazetteer, contorno, zonas, dataset e histórico de preços
```
