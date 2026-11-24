# CarMatch Avalia — o número justo

> A troca fecha quando o número é justo. A gente mostra o número.

Variante **v4** do laboratório `carmatch-lab`. Parte da mesma base da v1 e ataca
o ponto onde toda negociação de troca realmente acontece: **o valor**.

---

## O problema que esta versão ataca

O anúncio pede um valor que o próprio dono digitou. A Tabela FIPE é referência de
mercado, não preço — dois carros idênticos no papel diferem 30% na vida real por
quilometragem, estado, região e histórico.

Resultado: a negociação vira uma discussão sobre um número, e quem tem a melhor
informação ganha. Esta versão dá **o mesmo número para os dois lados**, com a
conta aberta.

---

## O modelo

`lib/valuation.ts` — função pura, documentada, importável pelo cliente.

Parte do valor FIPE declarado e aplica ajustes, cada um exposto em reais:

| Fator | Regra | Por quê |
|---|---|---|
| Quilometragem | 13.000 km/ano esperados; −1,8% por 10.000 km acima, até −22% | depreciação real de usado no Brasil |
| Km baixa | +1,0% por 10.000 km abaixo, até +6% | crédito existe, mas vale menos que a penalidade |
| Idade | isento até 3 anos; −0,6%/ano até −8% | a FIPE já embute depreciação por ano-modelo — não cobrar duas vezes |
| Carroceria | SUV +3%, Caminhonete +4%, Hatch +1%, Sedan −2% | liquidez de revenda no mercado brasileiro |
| Histórico declarado | dono único +2%, revisões +2,5%, revisão recente +1%, pneus +0,8%, nunca batido +1,5% (teto +8%) | declarações do dono, limitadas para não fabricarem valor |
| Faixa de confiança | base ±4%; +6 p.p. sem km; +1,5 p.p. carroceria desconhecida; +2 p.p. >10 anos | a faixa **alarga exatamente onde falta evidência** |

Cada linha do cálculo aparece na interface com o motivo em português e o impacto
em reais. Nunca existe um número sem a conta.

`recommendedSplit` reaproveita a mesma lógica de sobreposição e o mesmo sinal do
motor de matching da v1 (positivo = A paga B), então as duas telas nunca
discordam sobre quem paga.

---

## Honestidade faz parte do desenho

- Sem quilometragem informada, a faixa alarga para ±13,5% e a interface avisa que
  a estimativa é menos confiável.
- O modelo é declarado como **heurístico** na própria tela: não substitui
  vistoria, laudo cautelar nem a negociação entre as partes.
- Carroceria ambígua fica "desconhecida" e alarga a faixa, em vez de adivinhar.

---

## Onde aparece

- `/avaliar` — calculadora interativa, funciona deslogada.
- `/comparar` — dois anúncios lado a lado com o acerto recomendado.
- Painel de avaliação na página do anúncio, substituindo o "valor estimado" cru.
- Cartões de match mostram o acerto recomendado com uma linha de justificativa.

---

## Verificação

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Observado em execução:

- `npx tsc --noEmit` → 0 erros
- `npm run build` → compila
- `npx eslint .` → 0 erros
- `GET /api/valuation/[postId]` devolve a avaliação completa com `breakdown`

Exemplo real (Honda Fit EX/S 1.5 2005, 30.000 km, FIPE R$ 29.117):

```
bruto             R$ 29.117
quilometragem     +R$ 1.747   (243.000 km abaixo do esperado, teto de +6%)
idade             −R$ 2.329   (21 anos, −8% de liquidez)
carroceria        +R$ 291     (hatch)
valor justo       R$ 28.826   faixa R$ 27.096 – R$ 30.556   "justo"
```

E no par Fit × Prius: **o Fit paga R$ 18.800 ao Prius**, com faixa defensável de
R$ 15.000 a R$ 22.600.

Identidade visual: âmbar/laranja sobre neutro quente — análise, planilha,
"financeiro".
