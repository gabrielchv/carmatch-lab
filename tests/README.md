# tests — suíte do CarMatch Lab

Cobertura funcional das dez versões: regras de domínio, todas as rotas de API,
todos os filtros, os endpoints de manutenção e os fluxos de navegador.

```
tests/
├── run.mjs                  orquestrador (uma versão, todas, ou contínuo)
├── lib/harness.mjs          servidor isolado, cliente HTTP, fixtures
├── cli/                     contrato de linha de comando das ferramentas
├── unit/                    regras puras (sem servidor)
├── api/                     HTTP contra um servidor real
└── e2e/                     Chromium via playwright-core
```

## Rodar

```bash
cd ~/Documents/carmatch-lab/tests

node run.mjs                    # w1, tudo
node run.mjs --version w3       # uma versão
node run.mjs --all              # as dez  (~4 min)
node run.mjs --api-only         # sem navegador (~2 min)
node run.mjs --all --loop       # contínuo, uma passada a cada 20 s
node run.mjs --version w1 --loop --interval 10
```

Ou pelos atalhos do `package.json`:

```bash
npm test              # w1
npm run test:unit     # só unitários, rápido
npm run test:watch    # unitários em modo watch (node --test --watch)
npm run test:all      # as dez
npm run test:watch:all
```

## Números atuais

| | |
|---|---|
| arquivos de teste | 13 |
| casos executados por versão | ~171 |
| casos nas dez versões | **1701** |
| tempo com build frio | ~4 min (as dez) |
| tempo com cache quente | ~25 s por versão |

Tudo verde: `RESUMO — 10/10 versões passaram`.

## Como o isolamento funciona

Cada arquivo de teste sobe **o seu próprio servidor**, com o seu próprio banco
em `tmpdir`. Os dados de demonstração (16 anúncios por versão) nunca são
tocados — dá para rodar a suíte inteira com os servidores de demo no ar.

Três decisões que custaram tempo para acertar, todas comentadas no código:

1. **`next build` + `next start`, não `next dev`.** Next 16 recusa um segundo
   `next dev` no mesmo diretório e bloqueia requisições cross-origin em dev —
   o resultado é uma página que renderiza e nunca hidrata. O build de produção
   começa em ~300 ms e é o artefato que realmente vai ao ar. Build fica em
   `tests/.builds/<versão>`, invalidado por hash dos fontes.
2. **`node_modules` por hard link, nunca symlink.** O Turbopack rejeita um
   symlink apontando para fora da raiz do projeto.
3. **Porta com retry.** Arquivos rodam em paralelo; colisão de porta não é bug
   do produto, então o harness tenta a porta seguinte em vez de falhar.

Sessão em teste: o harness assina o cookie com o mesmo HMAC do `lib/auth.ts`
(segredo de 47 caracteres — **menos de 16 e o app ignora e cai no segredo de
dev**, o que produz um cookie que ele mesmo rejeita).

## O que é coberto

### `unit/` — regras puras
- **whatsapp**: normalização de telefone nos formatos que um brasileiro digita,
  rejeição de inválidos, idempotência, link `wa.me`, texto da mensagem de match
  e de interesse, direção do dinheiro.
- **cash**: `viewerDelta` soma zero entre os dois lados, rótulos "paga"/"recebe"
  nunca invertidos, tolerância, formatação BRL.
- **matching**: marca/modelo/ano, transmissão **com e sem ponto** (`Aut` vs
  `Aut.` — bug real do FIPE), tipo de veículo, modos de match.
- **onboarding**: recíproco, só entrada, só saída, sem carro desejado, nenhum
  carro na área, ano desconhecido, filtro geográfico, ordenação, e **faixa de
  valor** (dentro/fora, só piso, só teto, limites inclusivos, precedência do
  carro sobre a faixa).
- **location**: parsing de `Cidade - UF`, proximidade por raio, simetria da
  adjacência entre todos os 27 estados.
- **contact**: escolha da mensagem, direção do dinheiro dos dois lados,
  anunciante sem WhatsApp.

### `api/` — contra servidor real
- **auth**: login, sessão, logout, cookie forjado, WhatsApp obrigatório,
  normalização, perfil, onboarding salvo no perfil.
- **posts**: criação, validação por campo, upload válido/inválido/forjado,
  **todos os filtros** (`q`, preço, marca, modelo, ano, km, localização+raio,
  tipo desejado, ordenações, paginação, `mine=1`), `GET`, `PUT`, `DELETE`,
  regras de dono, e o exploit de `keepImages` (bloqueado).
- **reverse-filter**: "quem quer meu carro" — por modelo, só marca, ano,
  combinado com outros filtros, carro que ninguém quer.
- **onboarding-contact**: os quatro desfechos do preview, os 400 de entrada
  inválida, e o payload de WhatsApp (401 anônimo, 400 no próprio anúncio, link
  `wa.me` com mensagem, anunciante sem número).
- **debug-uploads-matching**: `/api/debug/*` com e sem token, `/uploads/*` com
  sete tentativas de path traversal, match recíproco vs mão única, privacidade
  dos matches.

### `cli/` — ferramentas de linha de comando

`tools/run-all.sh` roda sob `set -u`, então qualquer variável não definida é
fatal. O uso principal é `./tools/run-all.sh` **sem argumento nenhum** — e era
exatamente esse caminho que quebrava, porque `GEN_ARG="$2"` estourava antes de
qualquer default. A suíte cobre:

- sintaxe do bash;
- posicionais do corpo principal sempre com default (o scan ignora os
  posicionais de dentro de funções, que o próprio script fornece);
- `status` sem segundo argumento (a regressão em si);
- `status v|w|all`, geração inválida (exit 1), comando inválido (exit 1),
  `logs` sem alvo (exit 1);
- banner não imprime placeholder.

Roda **uma vez por sessão**, não por versão: a ferramenta é compartilhada.

### `e2e/` — navegador
- home renderiza e não gera erro de console;
- filtro reverso abre;
- onboarding: link direto com resultado, caminho "sem carro desejado", e a
  etapa 3 oferecendo a saída;
- login pela tela (geração W) e bloqueio sem WhatsApp;
- canal de contato correto por geração (WhatsApp na W, chat na V);
- página de debug.

Ruído de `next dev` (websocket do HMR, banner do DevTools) é filtrado: não é
defeito do produto e deixá-lo falhar treinaria todo mundo a ignorar a suíte.

## Defeitos que a suíte encontrou

- **Filtro reverso por marca devolvia zero.** Buscar só "Fiat" comparava o
  modelo do anúncio ("Argo") contra um modelo vazio. Corrigido nos cinco W.
- **Filtro reverso escondia todo anúncio com transmissão.** O anúncio pedia
  "Automático", o filtro mandava só `TRACKER`, e `"TRACKER".includes("aut.")` é
  falso. Reportado pelo usuário; coberto por três testes, um deles verificado
  falhando com o bug reintroduzido.
- **`dev-enabled` e `login` discordavam** em v2–v5: a UI mostrava o formulário
  de teste e a API respondia 404. Corrigido alinhando as duas condições.
- **v2–v5 estavam atrás da v1** no interruptor `UNSAFE_ALLOW_DEV_LOGIN`.
  Alinhados.
- **`vehicleMatchesCar` não era exportado** na geração V — impossível testar a
  regra isoladamente. Exportado (é uma função pura que já existia).
- **`./tools/run-all.sh` sem argumentos quebrava** (`$2: unbound variable`).
  Reportado pelo usuário; a suíte de `cli/` agora cobre esse caminho.

## Limites conhecidos

- A suíte `cli/` roda os comandos `status`/inválidos, que não sobem servidores.
  O caminho que **sobe** servidores (`start`) não é executado em teste — seria
  efeito colateral real. Para esse, a cobertura é a análise estática mais a
  verificação manual.
- Testes de navegador filtram ruído do `next dev` (websocket do HMR). O build
  usado é de produção, então esse ruído quase não aparece.
