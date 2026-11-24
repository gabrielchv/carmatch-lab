# CarMatch v1 — a versão original, consertada

Troca de carros entre pessoas no Brasil: você publica seu carro, diz o que aceita
na troca (com ou sem diferença em dinheiro), e o sistema encontra matches
recíprocos automaticamente.

Esta é a **v1 do laboratório**: a mesma ideia e os mesmos fluxos do projeto
original, com os defeitos corrigidos e a interface refeita. Nada de produto novo
aqui — as quatro apostas de produto estão em `../v2` … `../v5`.

---

## Rodando localmente

```bash
npm install
cp .env.local.example .env.local     # preencha SESSION_SECRET
npm run dev                          # http://localhost:3000
```

`.env.local` aceita:

| Variável | Para quê |
|---|---|
| `SESSION_SECRET` | Assina o cookie de sessão. **Obrigatório em produção** (≥16 chars). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Login via Google OAuth. |
| `DEBUG_TOKEN` | Libera `POST /api/debug/{seed,clear}` via header `x-debug-token`. Vazio = endpoints desligados. |
| `ALLOW_DEV_LOGIN=1` | Habilita login sem senha **apenas em build de desenvolvimento**. |

```bash
npm run build && npm start          # produção
npm run seed                        # popula dados via API da FIPE
```

---

## O que estava quebrado no original

Tudo abaixo foi reproduzido antes de ser corrigido.

### Segurança

- **`POST /api/debug/clear` apagava o banco inteiro sem autenticação.** Qualquer
  pessoa que adivinhasse a URL zerava produção. Agora exige `DEBUG_TOKEN` e
  responde 404 quando a variável não está configurada.
- **`POST /api/auth/login` permitia sequestro de conta.** Bastava enviar o e-mail
  de um usuário existente para receber a sessão dele — em produção. Agora exige
  `ALLOW_DEV_LOGIN=1` **e** `NODE_ENV=development`; um build de produção responde
  404 mesmo com a variável definida.
- **O cookie de sessão não era assinado.** O valor era `{"userId":"..."}` em JSON
  puro: trocar o id no cookie virava outra pessoa. Agora é HMAC-SHA256 com
  `SESSION_SECRET` e comparação em tempo constante.
- **Upload aceitava qualquer arquivo.** Extensão e bytes vinham do cliente, então
  dava para publicar um `.html` ou `.svg` com script na origem do app (XSS
  armazenado). Agora extensão, `Content-Type` e magic bytes precisam concordar;
  o nome é gerado no servidor; limite de 6 MB e 8 fotos.
- **`.env.local` era copiado para dentro da imagem Docker** (`COPY . .` sem regra
  no `.dockerignore`), levando `GOOGLE_CLIENT_SECRET` e `SESSION_SECRET` para as
  camadas da imagem. Corrigido no `.dockerignore`.
- **Matches de terceiros eram públicos.** `GET /api/posts/[id]/matches` servia os
  matches de qualquer anúncio para qualquer visitante. Agora só o dono.

### Correção funcional

- **A direção do dinheiro estava invertida na página de detalhe.** Em
  `app/posts/[id]/page.tsx` o valor era exibido sem considerar de que lado da
  troca o visitante está — quem pagava via "Você recebe". No caso real do Honda
  Fit 2005 × Toyota Prius 2012, o dono do Fit via "recebe R$ 18.826" quando na
  verdade paga. Centralizado em `lib/cash.ts` (`viewerDelta` / `viewerCashLabel`).
- **O badge de conversas nunca zerava.** `unread-count` devolvia o *total* de
  conversas, não as não lidas. Agora marca leitura por participante
  (`lastReadAt`) e a própria mensagem nunca conta como não lida.
- **O limite de distância do matching era ignorado.** O gate só rejeitava quando
  *os dois* anúncios definiam `maxDistance` — um anúncio com "até 100 km"
  casava com um carro do outro lado do país se o outro lado não tivesse limite.
  Agora cada lado é verificado contra a localização do outro.
- **Matching rodava a cada request de escrita em O(n²)** e recriava conversas.
  Mantido o O(n²) (é o correto para o tamanho atual), mas o resultado agora é
  determinístico e as conversas são idempotentes.
- **`writeData` escrevia no lugar.** Um crash no meio deixava JSON truncado, que
  voltava como `[]` e era sobrescrito no save seguinte. Agora é write-to-temp +
  `rename` atômico, com fallback explícito para gvs mount.
- **JSON corrompido virava lista vazia em silêncio.** Agora falha alto.
- **Qualquer usuário podia apagar a foto de outro.** `PUT /api/posts/[id]`
  aceitava `keepImages` do cliente sem validar, guardava um nome de arquivo
  alheio no próprio anúncio, e o `DELETE` seguinte removia o arquivo do diretório
  compartilhado. Reproduzido: a foto da vítima virou 404 enquanto o anúncio dela
  continuava apontando para ela. Agora `keepImages` é filtrado pelos arquivos que
  o anúncio já tinha.
- **Arquivos servidos de `public/uploads` sem política.** O handler estático do
  Next escolhe o `Content-Type` pela extensão, então um objeto não-imagem posto
  no bucket seria servido como `text/html`. `next.config.ts` agora manda
  `X-Content-Type-Options: nosniff` e uma CSP `sandbox` para `/uploads/*`.
- **`data/matches.json` estava defasado em relação ao próprio motor.** Os scores
  gravados (55 / 50 / 45) foram calculados por uma versão anterior do algoritmo;
  o motor atual produce 62 / 51 / 43 para os mesmos pares. Como o matching só
  roda em escrita, uma base parada serve percentuais errados indefinidamente. Os
  ids dos matches foram preservados na correção. Vale saber: **os percentuais
  exibidos são tão atuais quanto a última escrita no banco** — não há job de
  recálculo periódico.

### Interface e uso

- **"Honda Fit 2005" aparecia duas vezes** em cada card — o título já vem
  preenchido pela FIPE e o subtítulo repetia. `lib/present.ts` detecta e omite.
- **O botão de chat só existia no `hover`** — impossível de usar no celular, que é
  onde anúncio de carro é lido. Agora é sempre visível no toque.
- **Emoji no lugar de ícones**: `🚗` era usado para quilometragem (um carro ao
  lado de uma distância). Trocado por um conjunto de ícones SVG que herda cor.
- **Sem estados de carregamento nem de erro**: a página de detalhe ficava em
  "Carregando..." para sempre quando o anúncio não existia. Agora há skeleton,
  erro explícito e retorno.
- **Listagem sem paginação**: todos os posts vinham numa resposta só. Agora
  `page`/`pageSize` com "Carregar mais" e contagem de resultados.
- **`/my-posts` baixava o banco inteiro** e disparava uma requisição por anúncio
  para buscar matches. Agora `GET /api/me/overview` resolve tudo numa passada.
- **O controle de ordenação era cortado** em largura de tablet. O filtro agora
  empilha até `lg`.
- **Formulário sem validação no servidor**: ano inválido ou título vazio geravam
  card quebrado. Agora `POST`/`PUT` validam e devolvem erro por campo.
- **O `input type=file` cru** virou área de upload com formatos e limites ditos.
- Sistema de design centralizado em `app/globals.css` (tokens `@theme`), então as
  telas pararam de divergir em cinza, raio e tamanho de fonte.

---

## Dados

`data/*.json` é o banco (via `lib/db.ts`). `CARMATCH_DATA_DIR` e
`CARMATCH_UPLOAD_DIR` sobrescrevem os caminhos — em produção apontam para os
buckets GCS montados via gcsfuse.

## Deploy

Ver `deploy.sh` e `cloudbuild.yaml`. O projeto `carmatch-499019` precisa de
**billing habilitado** antes de qualquer deploy (hoje está desabilitado, e é por
isso que o serviço responde 503).
