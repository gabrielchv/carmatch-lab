# tools — rodar e popular as cinco versões

```
tools/
├── run-all.sh        sobe/derruba as cinco versões locais
├── seed-posts.mjs    gera anúncios com dados FIPE + fotos reais
├── fipe.mjs          cliente da Tabela FIPE (com cache em disco)
├── photos.mjs        fotos do Wikimedia Commons + normalização
└── .cache/           dados da FIPE, fotos e CREDITS.md
```

---

## 1. Rodar as cinco versões

Primeira vez, instale as dependências:

```bash
cd ~/Documents/carmatch-lab
for v in v1 v2 v3 v4 v5; do (cd $v && npm install); done
```

Depois:

```bash
./tools/run-all.sh            # inicia o que estiver parado
./tools/run-all.sh status     # o que está no ar
./tools/run-all.sh stop       # encerra tudo
./tools/run-all.sh restart    # reinicia todas
./tools/run-all.sh logs v3    # acompanha o log de uma versão
```

**Geração V** (chat interno):

| versão | porta | o que é |
|---|---|---|
| v1 | http://localhost:3200 | original corrigido |
| v2 | http://localhost:3502 | Confiança — verificação e dossiê |
| v3 | http://localhost:3503 | Corrente — trocas em anel |
| v4 | http://localhost:3504 | Avalia — valor justo e acerto |
| v5 | http://localhost:3505 | Troca Fechada — negociação até o fim |

**Geração W** (WhatsApp-first, sem chat):

| versão | porta | o que é |
|---|---|---|
| w1 | http://localhost:3601 | o pedido, fiel |
| w2 | http://localhost:3602 | Radar — alertas de match |
| w3 | http://localhost:3603 | Roda — correntes de 3–5 |
| w4 | http://localhost:3604 | Preço — valor justo na mensagem |
| w5 | http://localhost:3605 | Confiança — dossiê antes do primeiro oi |

```bash
./tools/run-all.sh start w     # só a geração W
./tools/run-all.sh start all   # as dez
```

Login em qualquer uma: `/auth` → **Entrar sem senha**.

O script cuida de um detalhe que já quebrou tudo uma vez: se você rodou
`npm run build`, sobra um `.next` de produção, e `next dev` passa a responder
**404 em todas as rotas**. Nesse caso o script move o build para
`.next.prod-<data>` antes de subir.

---

## 2. Popular os anúncios

```bash
node tools/seed-posts.mjs --all --reset            # v1..v5
node tools/seed-posts.mjs --all-w --reset          # w1..w5
node tools/seed-posts.mjs --port 3200 --reset      # uma só
node tools/seed-posts.mjs --all --dry-run          # só mostra o plano
```

| flag | padrão | para quê |
|---|---|---|
| `--port <n>` | 3200 | porta local alvo |
| `--url <url>` | — | alvo remoto (Cloud Run) |
| `--all` | — | as cinco portas locais |
| `--reset` | — | apaga tudo antes (usa `DEBUG_TOKEN`) |
| `--images <n>` | 2 | fotos por anúncio (`0` desliga) |
| `--users <n>` | 8 | quantas pessoas |
| `--rings a,b,c` | 3,4,5 | tamanhos das correntes |
| `--pairs <n>` | 2 | pares recíprocos (matches simples) |
| `--deals <n>` | 0 | negociações abertas (v5) |
| `--seed <n>` | 42 | semente do sorteio |
| `--dry-run` | — | não escreve nada |

### Anéis e pares — por que os dois

- **Anéis** (3, 4, 5): A quer o carro de B, B o de C, C o de A. Nenhum par do
  anel é recíproco — é exatamente a lacuna que a **v3** fecha. A v1 não acha
  match entre eles.
- **Pares** (2): A e B querem o carro um do outro. É o que gera os matches
  comuns da **v1, v2 e v4**.

Só anéis deixa a v1 vazia; só pares esconde o valor da v3.

### De onde vêm os dados

- **Carro, ano, valor**: API da Tabela FIPE, com cache em `tools/.cache/fipe`.
- **Fotos**: Wikimedia Commons, filtrando licença (CC0, domínio público, CC BY,
  CC BY-SA) e descartando interior/motor/logo/batida/carro de corrida. Normaliza
  para 1200×750 JPEG. Cada foto vai para `tools/.cache/photos/CREDITS.md` com
  licença, autor e link.
- **Quilometragem**: ~9.000–16.000 km/ano, fixa por carro.
- **Acerto**: diferença de preço entre os dois carros, tolerância ~7%. Num anel a
  soma é zero por construção.
- **Cidade**: por grupo, não por pessoa — quem troca carro está na mesma região.

---

## 3. Instalação de teste no Cloud Run

**https://carmatch-404714657867.southamerica-east1.run.app**

Credenciais em `carmatch-lab/.env.live` (chmod 600):

```
LIVE_URL, PROJECT, REGION, SERVICE, DEBUG_TOKEN
```

Essa instalação é **aberta de propósito**, porque é ambiente de teste:

| variável | valor | efeito |
|---|---|---|
| `DEBUG_TOKEN` | (48 hex) | libera `/api/debug/{seed,clear}` |
| `UNSAFE_ALLOW_DEV_LOGIN` | `1` | login sem senha funciona **em produção** |

`UNSAFE_ALLOW_DEV_LOGIN` é uma porta separada de `ALLOW_DEV_LOGIN` justamente
para o caso seguro continuar seguro: `ALLOW_DEV_LOGIN` só vale em build de
desenvolvimento, então um `.env.local` vazado nunca abre login em produção.
`UNSAFE_ALLOW_DEV_LOGIN` funciona em qualquer build e existe para deploys
descartáveis como este — não use dados reais ali.

Popular/limpar:

```bash
source .env.live
DEBUG_TOKEN=$DEBUG_TOKEN node tools/seed-posts.mjs --url "$LIVE_URL" --reset --images 2
```

Para fechar de novo:

```bash
gcloud run services update carmatch --region southamerica-east1 \
  --remove-env-vars UNSAFE_ALLOW_DEV_LOGIN,DEBUG_TOKEN
```

---

## 4. Defeitos que semear revelou

Todos corrigidos nos cinco projetos:

1. **Transmissão não casava.** A FIPE devolve `"…16V Aut."` e também
   `"…16V Aut"` sem ponto. O motor testava `includes("aut.")` e rejeitava a
   segunda forma — quem pedia automático nunca casava com um automático real.
2. **Faixa de km do desejo era sorteada à parte** da km real do carro desejado,
   então o gate reprovava por acaso.
3. **Imagem enviada depois do boot não era servida.** Em produção
   `/app/public/uploads` é um mount gcsfuse, e o handler estático do Next só
   conhece os arquivos do boot: a foto nova dava 404 até um redeploy. Agora
   existe `app/uploads/[...path]/route.ts`, que lê o disco a cada request.
4. **`npm run build` + `next dev` = 404 em tudo**, se aquela versão nunca teve
   cache de dev. `run-all.sh` resolve.
5. **Qualquer usuário autenticado podia apagar a foto de outro.** O
   `keepImages` do `PUT /api/posts/[id]` não era validado: dava para gravar o
   nome de um arquivo alheio no próprio anúncio e, ao excluí-lo, remover a foto
   de outra pessoa. Reproduzido e corrigido (o valor agora é filtrado pelos
   arquivos que o anúncio já possuía).
6. **`/uploads/*` sem política de conteúdo.** O handler estático do Next escolhe
   o `Content-Type` pela extensão; um objeto não-imagem no bucket seria servido
   como `text/html`. `next.config.ts` manda `nosniff` + CSP `sandbox`.
