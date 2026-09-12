# P2P Manager

Plataforma de gestão, acompanhamento e análise de operações P2P de USDT
(Binance). Next.js (App Router) + Supabase + Postgres direto.

## Arquitetura

- **Auth**: Supabase Auth (`@supabase/ssr`), sessão via cookies, middleware.ts protege todas as rotas exceto `/login`.
- **Dados**: schema Postgres dedicado `p2p_manager` (isolado de outros projetos que partilham o mesmo Supabase - `payments`, `p2p_arbitrage`, `metical_edge`). Acedido diretamente via `pg` (`src/lib/db.ts`), não através do `.from()` do Supabase, porque `p2p_manager` não está exposto na API PostgREST do projeto. **Toda a query filtra explicitamente por `user_id`** - RLS está ativo em todas as tabelas como defesa em profundidade, mas não é o mecanismo principal de proteção neste caminho de acesso.
- **Binance (privado)**: `src/lib/binancePrivateClient.ts` assina pedidos (HMAC-SHA256) ao histórico real de ordens C2C, usando uma chave própria desta app com permissão só de leitura. Só leitura - nunca cria/cancela ordens.
- **Binance (mercado, público)**: `src/lib/binancePublicP2P.ts` lê o livro de anúncios P2P público (o mesmo que o p2p.binance.com mostra), sem chave. `src/lib/marketAnalysis.ts` regista um snapshot real por par/lado e só confirma uma reversão de tendência ao fim de 2 leituras seguidas na nova direção acima do ruído - nunca prevê, só reporta o que já aconteceu.
- **Funções serverless em `fra1` (Frankfurt)**: definido em `vercel.json`. A Binance bloqueia `api.binance.com` a partir de IPs dos EUA (HTTP 451) - a região por omissão da Vercel é Washington D.C.

## Variáveis de ambiente

Cria um `.env.local` (nunca commitado) com:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
CRON_SECRET=
MESSAGING_BASE_URL=
MESSAGING_API_KEY=
BINANCE_API_KEY=
BINANCE_API_SECRET=
BYBIT_API_KEY=
BYBIT_API_SECRET=
```

Em produção (Vercel), define as mesmas variáveis via `vercel env add <NOME> production`.

## Base de dados

```bash
npm run db:apply   # aplica supabase/schema.sql ao DATABASE_URL (idempotente)
```

## Desenvolvimento

```bash
npm install
npm run dev
```

## Cron: sincronização de mercado

`/api/cron/market-sync` (GET, protegido por `Authorization: Bearer $CRON_SECRET`)
tira um snapshot real dos anúncios P2P para cada par/lado seguido
(`TRACKED_PAIRS` em `src/lib/marketAnalysis.ts`, atualmente USDT/MZN e
USDT/ZAR) e envia uma notificação push (via `MESSAGING_BASE_URL`) quando uma
tendência reverte de facto.

O plano Hobby da Vercel só permite cron jobs próprios uma vez por dia, o que
é lento demais para isto. Em vez disso, regista um agendador externo grátis
(ex. [cron-job.org](https://cron-job.org)) a chamar:

```
GET https://usdc-p2p.vercel.app/api/cron/market-sync
Authorization: Bearer <CRON_SECRET>
```

a cada 10-15 minutos. Sem isto, o gráfico de mercado no Dashboard só recebe
novos pontos quando alguém chamar este endpoint manualmente.
