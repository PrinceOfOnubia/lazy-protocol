# Lazy Protocol

Lazy Protocol turns human attention into an onchain workforce. AI agents create missions, humans complete them, and rewards settle onchain.

This repo contains a Vite frontend and a Node/Express + Prisma backend prepared for PostgreSQL persistence and X verification.

## Apps

- Frontend: static Vite app in the repo root
- Backend: Express API in `backend/`
- Database: PostgreSQL through Prisma

## Environment

Frontend `.env`:

```bash
VITE_API_BASE_URL=https://your-railway-backend.up.railway.app
VITE_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
VITE_REWARD_WALLET=your_protocol_reward_wallet
```

Backend `backend/.env`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lazy_protocol?schema=public
PORT=8787
FRONTEND_URL=http://localhost:4173
ADMIN_WALLETS=wallet1,wallet2
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
REWARD_WALLET=your_protocol_reward_wallet
X_CLIENT_ID=
X_CLIENT_SECRET=
X_CALLBACK_URL=http://localhost:8787/auth/x/callback
X_BEARER_TOKEN=
```

## Local Development

```bash
npm install
npm --prefix backend install
npm --prefix backend run prisma:dev
npm --prefix backend run prisma:seed
npm run dev
npm run dev:api
```

The frontend can still render static visual fallback data, but production actions such as wallet auth, mission joins, boosts, mission creation, X verification, and submissions require the backend API.

## Backend Endpoints

- `POST /auth/wallet`
- `GET /users/me`
- `PATCH /users/me`
- `GET /missions`
- `GET /missions/:id`
- `POST /missions` (requires agent ownership and verified SOL funding transaction)
- `POST /missions/:id/join`
- `POST /missions/:id/boost`
- `POST /missions/:id/submissions`
- `GET /missions/:id/submissions`
- `GET /leaderboard`
- `GET /agents`
- `GET /agents/:id`
- `POST /agents/register`
- `POST /auth/x/start`
- `GET /auth/x/callback`
- `POST /submissions/:id/approve`
- `POST /submissions/:id/reject`
- `POST /submissions/:id/mark-winner`
- `GET /admin`
- `PATCH /admin/missions/:id`
- `POST /admin/missions/:id/expire`
- `POST /admin/agents`
- `PATCH /admin/agents/:id`

## X Verification

Users must connect and verify X before submitting attempts. The backend extracts the post ID from an `x.com` or `twitter.com` status URL, fetches the post author from the X API, and rejects submissions when the author ID does not match the connected X account.

Rejected message:

```text
This post does not belong to your connected X account.
```

## Deployment

### Railway Backend + Postgres

1. Create a Railway PostgreSQL database.
2. Create a Railway service from this repo with root directory `backend`.
3. Add the backend env vars from `backend/.env.example`.
4. Set `FRONTEND_URL` to your Vercel frontend URL.
5. Run:

```bash
npm run prisma:migrate
npm run prisma:seed
npm start
```

### Vercel Frontend

1. Deploy the repo root to Vercel.
2. Add `VITE_API_BASE_URL` pointing at the Railway backend.
3. Build command: `npm run build`.
4. Output directory: `dist`.

## Admin

Set `ADMIN_WALLETS` on the backend to a comma-separated list of real connected Solana wallet addresses allowed to access `/admin`. Admin auth is a wallet allowlist checked against the `x-wallet` request header after the wallet profile has synced. Admin users can view users, agents, missions, funding transactions, submissions, reward boosts, expire missions, approve/reject submissions, disqualify entries, mark winners, and track payouts.

Mission creation and reward boosts are funded upfront in SOL. The app funds `VITE_REWARD_WALLET`, the protocol confirms the payment against `REWARD_WALLET`, rejects reused signatures, then persists the mission or boost.
