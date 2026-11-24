# CarMatch Corrente — trocas em cadeia

> Ninguém precisa querer o seu carro. A corrente fecha.

Variante **v3** do laboratório `carmatch-lab`. Parte da mesma base da v1 e
adiciona o mecanismo que resolve o problema estrutural do negócio: **o matching
par a par é raro demais**.

---

## O problema que esta versão ataca

Para uma troca fechar em par, duas pessoas precisam querer o carro uma da outra
ao mesmo tempo. Com 12 anúncios, isso é uma coincidência. Com 10.000, ainda é
raro — a oferta e a demanda precisam se cruzar exatamente.

Uma corrente só exige que **cada pessoa queira o carro da próxima**:

```
Ana troca o Prius pelo Fit do Carlos
Carlos troca o Fit pelo Uno do Roberto
Roberto troca o Uno pelo Prius da Ana
```

Três pessoas que nunca fechariam em par fecham em roda, no mesmo instante, com o
dinheiro equilibrado. É o maior ganho de liquidez disponível para esse negócio.

---

## Como o motor funciona

`lib/chains.ts` — puro, sem acesso a filesystem, importado tanto pela API quanto
pela página (client component).

1. **Grafo direcionado.** Aresta `A → B` existe quando algum `desiredTrade` de A
   aceita o carro de B. A compatibilidade reaproveita exatamente a lógica do
   motor par a par, extraída para `lib/compat.ts` para que os dois motores nunca
   divirjam.
2. **Detecção de ciclos simples** de tamanho 3 a 5. Cada anel é reportado uma vez
   só: as rotações do mesmo ciclo são deduplicadas por rotação canônica e ids
   estáveis.
3. **Equilíbrio de caixa.** Cada participante declara quanto paga/recebe
   (`cashAdjustment` ± `cashAdjustmentTolerance`). O anel só é viável se existir
   um conjunto de valores que satisfaça todas as faixas e some zero. O resultado
   traz `cashDeltas` por participante e `totalCash ≈ 0`.
4. **Score agregado**: média dos scores direcionais das arestas, mais
   `minEdgeScore` (o elo mais fraco) e avisos não bloqueantes.

Limites, todos explícitos em constantes:

- `MAX_CHAIN_LENGTH = 5` — acima disso a negociação deixa de ser prática.
- `MAX_SEARCH_STEPS = 200_000` — orçamento global de visitas por chamada.
- `MAX_CHAINS = 200` — teto de correntes devolvidas.

---

## Verificação

Algoritmo provado com um script executável, não com inspeção visual:

```bash
npx tsx scripts/check-chains.ts
```

Cobre: anel de 3, anel de 4, anel de 5, exclusão de anúncios desconexos,
equilíbrio de caixa dentro das tolerâncias, ausência de ciclos triviais
(auto-interesse), respeito aos limites de busca, rotação canônica e ids estáveis.

**Resultado observado: 31 asserções, todas passando.**

E, sobre os dados reais da base, o motor encontra **3 correntes** (tamanhos 3, 4 e
5) — não são dados sintéticos:

```
corrente 3: Fiat Uno → Honda Fit → Toyota Prius → Fiat Uno   (score 58)
corrente 5: Fiat Uno → VW Gol → GM Onix → Honda Fit → Prius  (score 51)
corrente 4: GM Cruze → Ford Ka → VW Gol → GM Onix → GM Cruze (score 48)
```

Cada uma com caixa batendo em R$ 0.

---

## Rodando

```bash
npm install
cp .env.local.example .env.local
npm run dev        # http://localhost:3000
```

Login local sem senha aparece em `/auth` quando `ALLOW_DEV_LOGIN=1` (apenas em
build de desenvolvimento).

Rotas novas: `/correntes` (visualização dos anéis), `GET /api/chains`.

Identidade visual: violeta/índigo — rede, grafo, conexão.
