# CarMatch w1 — WhatsApp-first

A geração **w** do laboratório. Mesma ideia do v1 (troca de carros entre pessoas),
com quatro mudanças estruturais:

1. **Sem chat.** Nenhuma conversa acontece dentro do app.
2. **WhatsApp como único canal**, com a proposta já escrita na mensagem.
3. **WhatsApp obrigatório na conta**, tanto no login por e-mail quanto no Google.
4. **Onboarding no primeiro acesso**, que explica, filtra, pergunta os dois carros
   e mostra se existe match antes de pedir cadastro.
5. **Filtro reverso** — "quem quer o carro que eu já tenho".

A w1 é a implementação fiel desse pedido. As variações de produto estão em
`../w2` … `../w5`.

---

## Rodando

```bash
cd ~/Documents/carmatch-lab
./tools/run-all.sh start w      # sobe w1..w5
./tools/run-all.sh status w
node tools/seed-posts.mjs --all-w --reset --images 2
```

w1 fica em <http://localhost:3601>. Login: `/auth` → **Entrar sem senha**
(`ALLOW_DEV_LOGIN=1`, só em build de desenvolvimento).

---

## 1. Sem chat

Foram removidos: `lib/chat.ts`, `lib/chat-context.tsx`, `components/ChatWidget.tsx`,
`components/ChatMessageList.tsx`, `components/MessageInput.tsx`, `app/chat/`,
`app/api/conversations/**`, e os tipos `Conversation` / `Message`.

O motor de matching não cria mais conversas — ele só grava matches.

## 2. WhatsApp como único canal

`lib/whatsapp.ts` (puro) contém tudo:

- `normalizeWhatsapp` — aceita `(11) 91234-5678`, `11912345678`, `+55 11 …`,
  `011 …` e devolve E.164 (`+5511912345678`) ou `null`. Sem isso, metade dos
  números brasileiros entraria no banco em formato inutilizável.
- `buildMatchMessage` — a mensagem de match:
  ```
  Oi, Fernanda! Demos match no CarMatch 🚗↔️

  Meu carro: VW - VolksWagen T-Cross 1.0 TSI (2021)
  https://…/posts/e0884de1-…

  Aceito seu Fiat CRONOS DRIVE 1.0 (2024) como negócio.
  Você me paga R$ 15.599 de diferença.
  Compatibilidade: 63%

  Vamos fazer negócio?
  ```
- `buildInterestMessage` — quando não há match, uma mensagem mais curta e honesta.
- `whatsappLink` — `https://wa.me/<digitos>?text=<mensagem codificada>`.

`lib/contact.ts` decide qual das duas usar: procura um match entre um anúncio do
visitante e o anúncio aberto. A direção do dinheiro vem de `cashFromViewer`, a
mesma regra do resto do app (positivo = você paga).

`GET /api/posts/[id]/contact` devolve o payload pronto para o visitante logado:

```
{ href, matched, message, unavailable?, ownerName, ownerWhatsapp }
```

Estados de erro são explícitos, não botões mortos:
`login-required` (401), `self` (400), `no-whatsapp` (anunciante sem número).

No UI, `WhatsappButton` renderiza o link; quando não há link, renderiza um
controle desabilitado **com o motivo**.

## 3. WhatsApp obrigatório na conta

- Login por e-mail: o formulário exige o número, e `POST /api/auth/login`
  responde `400` com `field: "whatsapp"` se ele não normalizar.
- Google: o OAuth nunca devolve telefone, então o callback redireciona para
  `/completar-perfil?redirectTo=…` quando o usuário ainda não tem número.
- `POST /api/auth/profile` é o único lugar que grava/edita o número.
- Publicar ou editar anúncio exige número: `403` com `code: "whatsapp_required"`.
- O número do anúncio é sempre o da conta (`contactInfo.whatsapp = user.whatsapp`).
  Um campo livre por anúncio permitiria publicar um telefone que a pessoa não
  controla.

## 4. Onboarding (`/boas-vindas`)

Cinco etapas: explicação → filtro rápido (cidade + raio) → carro que tenho →
carro que quero → resultado.

**O carro que você quer tem três respostas.** Na etapa "E o que você quer?":

1. **Carro específico** — marca → modelo/versão → **ano**, tudo da FIPE.
2. **Faixa de valor** — "de R$ 60.000 até R$ 90.000", ou só um dos dois. Usa o
   valor estimado de cada anúncio. É a resposta de quem sabe o orçamento mas
   não o modelo, e não esconde carros que a pessoa aceitaria.
3. **Só quero ver quem quer o meu carro** — roda a mesma busca sem a segunda
   pergunta. É a pergunta completa para quem está decidindo se vale a pena
   anunciar: *alguém aceitaria o que eu já tenho?*

A faixa também é compartilhável:
`/boas-vindas?haveBrand=Fiat&haveModel=CRONOS&haveYear=2024&wantMin=80000&wantMax=120000`
e o botão "Ver estes anúncios" leva a listagem já filtrada por ela
(`minPrice`/`maxPrice`).

Quando os dois vêm na mesma requisição, **o carro vence**: é a afirmação mais
específica, e um anúncio de R$ 73 mil pode estar fora da faixa 80–120 e ainda
ser exatamente o modelo pedido.

Nesse modo o resultado muda de vocabulário, não de tela:

| | dois sentidos | só "quem quer o meu" |
|---|---|---|
| título | "Tem gente querendo seu carro" | "3 pessoas querem seu carro" |
| subtítulo | "3 pessoas aceitam seu carro como parte do negócio" | "3 anúncios aceitariam seu carro na troca. Fale com eles direto no WhatsApp." |
| coluna "Você quer" | sim | não aparece |
| nada encontrado | "nenhum bateu nos dois sentidos" | "nenhum aceita o seu na troca" |

O resultado vem de `POST /api/onboarding/preview` (`lib/onboarding.ts`), que
compara em **duas direções**:

- `inbound` — este anúncio aceita o meu carro?
- `outbound` — eu quero o carro deste anúncio?
- os dois → **match**

Casos de borda tratados explicitamente, cada um com texto próprio:

| situação | `outcome` | o que a tela diz |
|---|---|---|
| nenhum anúncio na área | `no-posts` | convida a publicar primeiro |
| comparou e nada bateu | `no-match` | sugere ampliar a região |
| match recíproco | `reciprocal` | lista os anúncios |
| só querem o meu | `inbound-only` | "N pessoas aceitam seu carro" |
| só quero o deles | `outbound-only` | explica que falta o outro lado |

Outros detalhes:

- Ano é opcional; sem ele, os limites de ano são **descartados** no cálculo em
  vez de usar um ano inventado que rejeitaria anúncios válidos.
- O wizard lembra as respostas em `localStorage` e no perfil quando há login.
- Não exige cadastro para ver o resultado — o valor tem que aparecer antes da
  barreira de signup.
- Link compartilhável:
  `/boas-vindas?haveBrand=Fiat&haveModel=CRONOS&haveYear=2024&wantBrand=VW%20-%20VolksWagen&wantModel=T-Cross`
  roda a checagem na hora. Só `haveBrand` e `haveModel` são obrigatórios — sem
  `wantBrand`/`wantModel` o link cai no modo "quem quer o meu".
- O redirecionamento automático da home tem três guardas (URL com filtro,
  `localStorage` de concluído, `sessionStorage` de já exibido) para não virar
  um loop quando alguém clica em "Ver carros".

## 5. Filtro reverso — "Quem quer meu carro"

`components/WantMyCarFilter.tsx` coleta **marca → modelo/versão → ano** do carro
que a pessoa **já tem**, tudo da Tabela FIPE (`components/CarPicker.tsx`), e
filtra no servidor:

```
GET /api/posts?wantsBrand=GM+-+Chevrolet&wantsModel=TRACKER
             &wantsVersion=TRACKER+LT+1.8+16V+Flex+4x2+Aut.&wantsYear=2016
```

A regra é a mesma de `runMatching` (`vehicleMatchesCar`), então o filtro nunca
discorda do motor.

Duas coisas que o filtro precisa **não** exigir, porque não as conhece:

- **ano** — sem ano informado, os limites de ano do anúncio são ignorados;
- **transmissão** — sem versão escolhida, a exigência de transmissão do anúncio
  é ignorada. Era esse o bug: o anúncio pedia "Automático", o filtro mandava só
  `TRACKER`, `"TRACKER".includes("aut.")` é falso, e todo anúncio que
  especificava transmissão ficava invisível.

Com a versão completa da FIPE a transmissão vem no nome
(`TRACKER LT 1.8 16V Flex 4x2 Aut.`), então o match fica preciso: quem tem a
versão automática encontra o anúncio que pede automático, e quem tem a manual
não aparece para ele.

---

## Verificado em execução

| item | resultado |
|---|---|
| `npx tsc --noEmit` | 0 erros |
| `npm run build` | compila |
| `npx eslint .` | 0 erros |
| `/`, `/boas-vindas`, `/auth`, `/completar-perfil`, `/my-posts`, `/posts/[id]` | 0 erros de console |
| onboarding recíproco | `outcome: reciprocal`, 16 comparados, 1 match |
| onboarding sem match | `outcome: no-match` |
| onboarding só "quem quer o meu" | `outcome: inbound-only`, `wantSkipped: true`, 1 anúncio |
| só "quem quer o meu", sem ninguém | `outcome: no-match`, `wantSkipped: true` |
| faixa de valor | `wantMode: price`, anúncios dentro do valor |
| faixa sem nenhum limite | `400` |
| faixa com min > max | `400` |
| `want` incompleto | `400` |
| `have` faltando | `400` |
| payload inválido | `400` |
| filtro reverso | 1 resultado (o anúncio que aceita o Cronos) |
| filtro reverso sem ninguém | 0 |
| filtro reverso com transmissão exigida | encontra (regressão coberta) |
| versão automática vs manual | casam com o anúncio certo |
| login sem WhatsApp | `400`, `field: whatsapp` |
| contato anônimo / do dono | `401` / `400` |
| link gerado | `https://wa.me/5511…?text=…` |

---

## Defeitos encontrados durante a construção

- **Hook depois de `return` antecipado** na página de anúncio: React recusou a
  ordem de hooks. O `useEffect` que busca o payload do WhatsApp estava depois dos
  `return` de loading/erro; foi movido para cima, lendo `post?.id`.
- **401 no console do onboarding**: o wizard chamava `/api/auth/profile` mesmo
  deslogado. Agora checa `/api/auth/me` (que responde 200 com `user: null`).
- **Estatística contraditória**: "Match encontrado" ao lado de "Querem seu carro:
  0", porque o match não era contado dos dois lados. Agora "Aceitam seu carro" e
  "Você quer" incluem os matches.
