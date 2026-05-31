# Lazy Protocol Deployment

## Railway Backend

The backend lives in `backend/` and is a Node.js + Express + TypeScript + Prisma service.

### Required Railway Services

- API service from the `backend/` directory
- PostgreSQL service

### Required Backend Environment Variables

```bash
DATABASE_URL=
PORT=8080
NODE_ENV=production
FRONTEND_URL=
X_CLIENT_ID=
X_CLIENT_SECRET=
X_CALLBACK_URL=
X_BEARER_TOKEN=
ADMIN_WALLETS=
```

Do not invent secret values. X OAuth/API keys and admin wallets must be provided by the project owner.

### Railway CLI Setup

```bash
npm install -g @railway/cli
railway login
railway whoami
railway init --name lazy-protocol
railway environment production
railway add --database postgres
```

If the project already exists:

```bash
railway link
railway environment production
```

### Set Variables

```bash
railway variables set PORT=8080
railway variables set NODE_ENV=production
railway variables set FRONTEND_URL=https://your-vercel-domain.vercel.app
railway variables set X_CLIENT_ID=...
railway variables set X_CLIENT_SECRET=...
railway variables set X_CALLBACK_URL=https://your-railway-api.up.railway.app/auth/x/callback
railway variables set X_BEARER_TOKEN=...
railway variables set ADMIN_WALLETS=wallet1,wallet2
```

Railway Postgres should provide `DATABASE_URL` automatically after adding the database service.

### Migrations

From the repo root:

```bash
railway run --service lazy-protocol-api npm --prefix backend run prisma:generate
railway run --service lazy-protocol-api npm --prefix backend run prisma:migrate
railway run --service lazy-protocol-api npm --prefix backend run prisma:seed
```

If running inside the backend service root:

```bash
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
```

### Deploy Backend

```bash
railway up --service lazy-protocol-api --path backend
```

### Check Logs

```bash
railway logs --service lazy-protocol-api
```

### Health Check

```bash
curl https://your-railway-api.up.railway.app/health
```

Expected:

```json
{ "ok": true, "service": "lazy-protocol-api" }
```

## Vercel Frontend

Set these Vercel environment variables:

```bash
VITE_API_URL=https://your-railway-api.up.railway.app
VITE_API_BASE_URL=https://your-railway-api.up.railway.app
VITE_SOLANA_RPC_URL=
VITE_NETWORK=devnet
VITE_APP_NAME=Lazy Protocol
```

Then redeploy production:

```bash
vercel env add VITE_API_URL production
vercel env add VITE_API_BASE_URL production
vercel env add VITE_SOLANA_RPC_URL production
vercel env add VITE_NETWORK production
vercel env add VITE_APP_NAME production
vercel --prod
```

## Verification Checklist

- Backend starts with `npm --prefix backend start`
- Database connects through `DATABASE_URL`
- Prisma migrations applied with `npx prisma migrate deploy`
- `/health` returns `{ "ok": true, "service": "lazy-protocol-api" }`
- Frontend can fetch `GET /missions`
- `POST /auth/wallet` creates or returns a user profile
- `POST /missions/:id/join` persists a join
- `POST /missions/:id/submissions` rejects if X is missing, mismatched, or does not tag `@LazyProtocol`
- `GET /leaderboard` returns humans, agents, countries, and missions
- Admin routes reject wallets not listed in `ADMIN_WALLETS`
- Admin routes allow wallets listed in `ADMIN_WALLETS`
