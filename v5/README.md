# CarMatch Troca Fechada

> O match é o começo. A Troca Fechada cuida do resto.

Marketplace brasileiro de troca de carros. A base encontra o match e abre a
conversa; esta variante (v5) leva o acordo até o fim: vistoria, documentos dos
dois lados, contrato de troca e transferência no Detran.

## Rodando

```bash
npm install
cp .env.local.example .env.local   # preencha SESSION_SECRET, DEBUG_TOKEN e ALLOW_DEV_LOGIN=1
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Em desenvolvimento, a tela
`/auth` permite login por e-mail sem senha (`ALLOW_DEV_LOGIN=1`).

## A esteira da troca

```
proposta → aceite → vistoria → documentos → contrato → transferencia → concluida
                                                                    ↘ cancelada
```

- Cada etapa tem tarefas obrigatórias **por lado** (A = anúncio A, B = anúncio B),
  definidas como dados em `lib/deal.ts`.
- Só é possível avançar quando todas as tarefas obrigatórias da etapa atual
  estão concluídas **nos dois lados**. O guard roda no servidor: esconder o
  botão não basta.
- Toda transição entra em `history` (`at`, `by`, `from`, `to`, `note`), que é
  append-only. O mesmo vale para criação e cancelamento.
- `progress` = etapas concluídas + fração de tarefas obrigatórias da etapa atual.
- `blockers` lista o que falta na etapa atual, com o lado de cada pendência.

As tarefas de documentos cobrem o que o Detran e os bancos costumam exigir:
CRLV digital, CNH, comprovante de residência, quitação de IPVA/licenciamento,
ausência de multas, ausência de alienação/gravame, laudo de vistoria, contrato
de troca assinado, ATPV-e, taxas e protocolo de transferência.

## API

Todas as rotas exigem sessão (`getCurrentUser`) e são restritas aos
participantes da negociação.

| Método | Rota | O que faz |
| --- | --- | --- |
| `POST` | `/api/deals` | Cria a negociação a partir de `matchId` ou `postId` + `otherPostId`. O chamador precisa possuir um dos anúncios. Idempotente enquanto a negociação está viva. |
| `GET` | `/api/deals` | Lista as negociações do usuário com progresso, etapa e pendências. |
| `GET` | `/api/deals/[id]` | Sala de negociação (participantes apenas; terceiros recebem 404). |
| `POST` | `/api/deals/[id]/tasks` | Marca/desmarca uma tarefa da etapa atual. Só o lado responsável pode marcar (403 caso contrário). |
| `POST` | `/api/deals/[id]/advance` | Tenta avançar. Sem as tarefas obrigatórias dos dois lados, responde **409** com `blockers`. |
| `POST` | `/api/deals/[id]/cancel` | Cancela e registra a transição no histórico. |

## Verificação da máquina de estados

```bash
npm run check:deal
```

O script usa um diretório de dados temporário e cobre: avanço recusado com
tarefa obrigatória em aberto, avanço permitido quando os dois lados concluem,
histórico crescente/encadeado e tarefa marcada pelo lado errado (403).

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind v4. Persistência em
JSON via `lib/db.ts` (escrita atômica por rename).
