# P2P Manager

Plataforma de gestão, acompanhamento e análise de operações P2P de USDT
(Binance). Next.js (App Router) + Supabase + Postgres direto.

## Arquitetura

- **Auth**: Supabase Auth (`@supabase/ssr`), sessão via cookies, middleware.ts protege todas as rotas exceto `/login`.
- **Dados**: schema Postgres dedicado `p2p_manager` (isolado de outros projetos que partilham o mesmo Supabase - `payments`, `p2p_arbitrage`, `metical_edge`). Acedido diretamente via `pg` (`src/lib/db.ts`), não através do `.from()` do Supabase, porque `p2p_manager` não está exposto na API PostgREST do projeto. **Toda a query filtra explicitamente por `user_id`** - RLS está ativo em todas as tabelas como defesa em profundidade, mas não é o mecanismo principal de proteção neste caminho de acesso.
- **Binance**: `src/lib/binancePrivateClient.ts` assina pedidos (HMAC-SHA256) ao histórico real de ordens C2C. Só leitura - nunca cria/cancela ordens.

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

## Nota conhecida: sincronização Binance

As chaves Binance fornecidas devolveram `Invalid API-key, IP, or permissions`
quando testadas a partir deste ambiente - quase certamente uma restrição de
IP (a mesma chave parece já estar em uso pelo `metical_edge`). Confirma no
painel da Binance se a chave permite o IP de saída da Vercel, ou remove a
restrição de IP, antes de esperar que "Sincronizar agora" funcione em
produção.
