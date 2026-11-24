# CarMatch Confiança

Variante do CarMatch em que **verificação e confiança são o produto**:
“Troca com verificação — só fecha com quem tem dossiê.”

## Modelo de confiança

- **Conta verificada** (`/verificar`): e-mail, telefone, CPF, CNH, selfie com
  prova de vida e comprovante de residência. Só o resultado booleano é salvo —
  nenhum número de documento é armazenado.
- **Dossiê do veículo** (na página do anúncio): documento no nome do vendedor,
  sem multas, sem gravame/alienação, sem recall, laudo de vistoria, histórico
  de revisões e único dono. Só o dono do anúncio pode confirmar.
- **Nota 0–100**: `Novo` (<40), `Verificado` (40–74), `Confiável` (75+).
  A nota do anúncio é **40% vendedor + 60% dossiê** — o carro pesa mais porque
  é o que o comprador consegue inspecionar.
- **Filtro** “Só anúncios verificados” (`?minTrust=verificado|confiavel`),
  aplicado no servidor em `GET /api/posts`.

### Pesos

| Conta | Pts | Dossiê | Pts |
| --- | ---: | --- | ---: |
| CPF | 25 | Documento no nome | 30 |
| Telefone | 20 | Sem gravame | 20 |
| Selfie/liveness | 20 | Sem multas | 15 |
| CNH | 15 | Vistoria | 15 |
| Comprovante de endereço | 15 | Histórico (2+ revisões) | 10 |
| E-mail | 5 | Recall / único dono | 5 + 5 |

## Endpoints novos

- `POST /api/verification` — `{ signal, confirmed? }` (dono = sessão).
- `POST /api/posts/[id]/dossier` — `{ item, checked }`,
  `{ action: "addService", entry }` ou `{ action: "removeService", entryId }`
  (exige ser dono do anúncio).

## Dados de demonstração

```bash
npm install
npm run seed:trust   # preenche verificações/dossiês nos dados existentes
npm run dev
```

O `seed:trust` é idempotente e não mexe em posts, usuários, imagens nem
conversas. `npm run seed` recria a base do zero (todo mundo volta a “Novo”).

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
