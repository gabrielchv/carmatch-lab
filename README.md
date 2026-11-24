# CarMatch Lab

Troca de carros entre pessoas no Brasil, em duas gerações de produto.

```
carmatch-lab/
│
├── geração V — chat interno
│   ├── v1/   original, corrigido           → Cloud Run (público)
│   ├── v2/   Confiança   (verificação)
│   ├── v3/   Corrente    (trocas em cadeia)
│   ├── v4/   Avalia      (valuation)
│   └── v5/   Troca Fechada (transação)
│
└── geração W — WhatsApp-first
    ├── w1/   o pedido, fiel               → WhatsApp no lugar do chat
    ├── w2/   Radar     (alertas de match)
    ├── w3/   Roda      (correntes de 3–5)
    ├── w4/   Preço     (valor justo na mensagem)
    ├── w5/   Confiança (dossiê antes do primeiro oi)
    └── w6/   FIPE enxuta (o mesmo carro, sem 20 acabamentos)
```

A geração **V** mantém o chat interno. A geração **W** remove o chat por
completo: toda conversa acontece no WhatsApp, com a proposta já escrita, o
número é obrigatório na conta, existe onboarding no primeiro acesso e um filtro
reverso ("quem quer o carro que eu tenho").

**Se você quer o onboarding, é a geração W** — `http://localhost:3601/boas-vindas`
(a V não tem essa tela).

No onboarding da geração W, dizer o que você quer é **opcional**: a etapa final
oferece "Só quero ver quem quer o meu carro", que responde apenas a direção de
entrada. É a pergunta que decide se vale a pena anunciar.

Todo campo de carro (onboarding e filtro reverso) é **marca → modelo/versão →
ano da Tabela FIPE**, igual ao formulário de anúncio. A versão importa: é ela que
carrega a transmissão exigida por muitos anúncios.

A **w6** muda como a Tabela FIPE é perguntada. A FIPE repete cada acabamento como
um modelo: a Chevrolet tem 557 entradas e a TRACKER sozinha ocupa 20 linhas de
select — LT, LTZ, Premier, Midnight, RS. Um select de 20 itens não é preciso, é
uma parede. A w6 pergunta em três níveis:

```
Marca  →  Modelo (a linha: "Tracker", "Corolla")  →  Versão (motor e câmbio)  →  Ano
```

O que muda é o **acabamento sair da pergunta**, não o carro: "Tracker 1.8 Flex ·
Aut." cobre LT, LTZ, Premier e Midnight, porque são o mesmo carro na troca. Na
Chevrolet isso vira 61 modelos e 382 opções em vez de 557. Nas dez marcas
maiores, 2.609 modelos viram 1.904 opções em 271 linhas.

Agrupar é atalho, nunca perda: cada opção abre um select **"Versão exata"** com
todas as entradas da FIPE que ela cobre — "Gol 1.0 Flex 8V · Mec." mostra as 11
versões da tabela, e escolher uma grava aquele nome e aquele código, não o
representante do grupo. Os 549 códigos da VW continuam todos alcançáveis; o
agrupamento só evita começar por uma parede de 549 linhas.

Duas coisas **não** são fundidas, mesmo parecendo acabamento:

- **carroceria** — "Onix Hatch" e "Onix Sedan" são carros diferentes, com preço
  diferente. Antes viravam uma opção só e o dono do sedan publicava um anúncio
  com o nome e a FIPE do hatch.
- **nomes que o módulo não consegue ler** — "Astra 2.0 8V/ CD 2.0 8V" nomeia dois
  carros numa string. Fica como opção própria: uma fusão errada faz um anúncio
  sumir, uma lista um pouco maior não.

A primeira palavra de um nome FIPE é sempre o modelo. Isso importa: "City" é
acabamento no Palio e modelo na Honda, e a posição é o que distingue os dois.

E o matcher usa a **mesma decomposição**: escolher "Tracker 1.8 Flex" alcança um
anúncio gravado como "TRACKER LTZ 1.8 16V Flex 4x2 Aut.". É isso que torna a
lista curta segura — `lib/car-simplify.ts` define `sameCar` e `simplifyModels`
com as mesmas chaves.

### Quando a Tabela FIPE sai do ar

A FIPE pública é gratuita e **limitada**: passado o limite ela responde `429`, e
isso já apareceu como "Não foi possível carregar os modelos" em marcas ainda
não visitadas. O cliente agora trata isso como o que é — indisponibilidade
temporária, não erro de dados:

- `429` e `5xx` são repetidos com backoff, respeitando `Retry-After` (limitado,
  para a tela não travar esperando uma hora).
- Depois de um `429` persistente, um **disjuntor** de 60s pula a fonte primária
  e vai direto à secundária — sem ele cada marca custava ~8s para aprender a
  mesma coisa.
- **Segunda fonte**: a BrasilAPI serve o mesmo catálogo com os *mesmos* códigos
  de marca e modelo (conferido: 549 de 549 códigos, zero divergência de nome),
  então o código gravado no anúncio continua significando o mesmo carro.
- **Cópia em disco** (`data/fipe-cache/`): o último catálogo bom é servido
  quando o serviço cai, marcado na tela como cópia — nunca apresentado como
  atual.
- **`404` não usa cópia nem segunda fonte**: dizer que um carro não existe é um
  fato, não uma queda de serviço.
- Se a lista de **anos** não puder ser carregada, o campo vira um número
  digitável com a explicação, em vez de um select vazio que parece "este carro
  não tem anos". O preço FIPE simplesmente não é preenchido sozinho.

O erro nunca é engolido: a mensagem diz o que aconteceu e oferece "Tentar de
novo".

`FIPE_API_BASE` e `FIPE_FALLBACK_BASE` apontam o cliente para outra fonte (os
testes usam isso para simular a FIPE quebrada); `FIPE_FALLBACK_BASE=off`
desliga a segunda fonte.

O projeto original permanece intacto em `~/Documents/carmatch`.

---

## Estado verificado

| | build | tsc | lint | runtime |
|---|---|---|---|---|
| v1 | ✅ | ✅ | 0 erros | ✅ deployado |
| v2 | ✅ | ✅ | 0 erros | ✅ |
| v3 | ✅ | ✅ | 0 erros | ✅ |
| v4 | ✅ | ✅ | 0 erros | ✅ |
| v5 | ✅ | ✅ | 0 erros | ✅ |

Todas as cinco abrem sem erro de console.

**Demo ao vivo (w6):** https://carmatch-404714657867.southamerica-east1.run.app

---

## O ponto de partida

O original é um bom v0: Next.js + JSON em disco, matching recíproco, chat por
polling. Funciona. Mas para exatamente onde o negócio começa — no "achei um
match" — e tinha defeitos sérios: um endpoint que apagava o banco sem
autenticação, sequestro de conta pelo login, cookie de sessão não assinado, XSS
armazenado por upload, e a direção do dinheiro invertida na tela de detalhe.
Tudo isso está documentado e corrigido em `v1/README.md`.

## As quatro apostas

Cada variante parte da mesma base e implementa **um mecanismo real**. Não são
skins de UI.

### v2 — Confiança: o problema é não confiar no estranho

Ninguém entrega um carro para um desconhecido. A v1 mostra carros; a v2 mostra
**quem** está do outro lado. Seis sinais de identidade (e-mail, telefone, CPF,
CNH, selfie com prova de vida, comprovante de residência) com pesos explícitos,
somados a um dossiê do veículo (propriedade, multas, gravame, recall, vistoria,
histórico), produzem um score que filtra a listagem.

Implementado: `lib/trust.ts`, `/verificar`, `TrustBadge`, `DossierSection`,
`POST /api/verification`, `POST /api/posts/[id]/dossier`, filtro `minTrust` no
servidor.

### v3 — Corrente: o matching par a par é raro demais

A v3 detecta **ciclos** de 3 a 5 anúncios com caixa equilibrado. Sobre os dados
reais da base ela encontra **3 correntes** — tamanhos 3, 4 e 5, todas com o
dinheiro somando zero. Anéis que o matching par a par jamais encontraria.

Implementado: `lib/chains.ts` (motor puro), `lib/compat.ts` (compatibilidade
compartilhada com o motor par a par), `/correntes`, `GET /api/chains`.
Provado por `npx tsx scripts/check-chains.ts` — **31 asserções, todas passando**.

### v4 — Avalia: a negociação é uma discussão sobre um número

Calcula valor justo a partir da FIPE ajustando quilometragem, idade, carroceria e
histórico, com faixa de confiança que **alarga onde falta informação**, e mostra
cada ajuste em reais. `recommendedSplit` reaproveita o mesmo sinal do motor de
matching, então as telas nunca discordam sobre quem paga.

Implementado: `lib/valuation.ts`, `/avaliar`, `/comparar`,
`GET /api/valuation/[postId]`, painel no anúncio, acerto nos cartões de match.

### v5 — Troca Fechada: o match não é o negócio

No Brasil, trocar carro significa vistoria, CRLV, CNH, comprovante, IPVA, multas,
gravame, contrato e transferência no Detran — nos dois veículos. É aqui que a
troca morre. Máquina de estados `proposta → aceite → vistoria → documentos →
contrato → transferencia → concluida` com checklist por lado, travas aplicadas
**no servidor** e histórico auditável.

Implementado: `lib/deal.ts`, `/negociacoes`, `/negociacoes/[id]`, cinco rotas de
API. Provado por `npm run check:deal` — **4/4 verificações da máquina de
estados**, incluindo recusa de avanço com tarefa aberta (409) e bloqueio de
marcação pelo lado errado (403).

---

## Rodando

Primeira vez, instale as dependências de cada versão:

```bash
for v in v1 v2 v3 v4 v5 w1 w2 w3 w4 w5 w6; do (cd $v && npm install); done
```

O launcher entende as duas gerações. **Sem argumento ele sobe a W** (a atual):

```bash
./tools/run-all.sh             # W — a geração atual (3601-3606)
./tools/run-all.sh start v     # V — a anterior, com chat (3200, 3502-3505)
./tools/run-all.sh start all   # as dez
./tools/run-all.sh status      # o que está no ar + URL do onboarding
./tools/run-all.sh stop all
```

Depois, uma coisa só sobe as cinco:

```bash
./tools/run-all.sh          # inicia o que estiver parado
./tools/run-all.sh status   # o que está no ar
./tools/run-all.sh stop     # encerra tudo
./tools/run-all.sh logs v3  # acompanha uma versão
```

| versão | porta | o que é |
|---|---|---|
| v1 | 3200 | original corrigido |
| v2 | 3502 | Confiança — verificação e dossiê |
| v3 | 3503 | Corrente — trocas em anel |
| v4 | 3504 | Avalia — valor justo e acerto |
| v5 | 3505 | Troca Fechada — negociação até o fim |

## Populando os anúncios

```bash
node tools/seed-posts.mjs --all --reset
```

Gera 16 anúncios por versão a partir da **Tabela FIPE** (marca, modelo, ano,
preço reais) com **fotos reais do Wikimedia Commons**, montando 3 correntes
(anéis de 3, 4 e 5) e 2 pares recíprocos. Resultado verificado:

```
v1  16 anúncios · 2 matches · 0 correntes
v2  16 anúncios · 2 matches · 0 correntes   (+ confiança e dossiês)
v3  16 anúncios · 2 matches · 3 correntes
v4  16 anúncios · 2 matches · 0 correntes   (+ avaliações)
v5  16 anúncios · 2 matches · 0 correntes   (+ 2 negociações)
```

Login local: `/auth` mostra "login de teste" quando `ALLOW_DEV_LOGIN=1` — aceito
apenas em build de desenvolvimento; em produção a rota responde 404.
Detalhes e todas as flags em `tools/README.md`.

## Testes

Suíte funcional das dez versões: regras de domínio, todas as rotas de API,
todos os filtros, endpoints de manutenção e fluxos de navegador.

```bash
cd tests
node run.mjs --all            # as dez (~4 min)
node run.mjs --all --loop     # contínuo
```

**1615 casos, 10/10 versões verdes.** Detalhes em [`tests/README.md`](tests/README.md).

## Deploy

Só a w6 está publicada, no Cloud Run:

```bash
cd w6
export SESSION_SECRET="$(openssl rand -base64 32)"
./deploy.sh
```

O `deploy.sh` usa `--source`, então o build acontece no Cloud Build e a revisão
nova assume o tráfego. As variáveis de ambiente já existentes no serviço são
preservadas; `SESSION_SECRET` precisa estar no ambiente porque `lib/auth.ts`
recusa subir sem ela em produção.

Dois volumes GCS ficam montados no container:

- `carmatch-data-499019` → `/app/data` (usuários, anúncios, matches e o cache
  do catálogo FIPE)
- `carmatch-uploads-499019` → `/app/public/uploads` (fotos dos anúncios)

O volume de dados é o que faz o app sobreviver a um deploy: o sistema de
arquivos do container é efêmero, o bucket não.

Para reverter uma revisão:

```bash
gcloud run services update-traffic carmatch --region southamerica-east1 \
  --to-revisions <REVISION_NAME>=100
```

**Nunca habilite `UNSAFE_ALLOW_DEV_LOGIN` nem `DEBUG_TOKEN` em produção.** Os
dois existem para desenvolvimento local; o primeiro permite login sem senha, o
segundo expõe as rotas de semeadura e limpeza de dados.
