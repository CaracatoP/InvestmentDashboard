# Investment Dashboard

Full-stack dashboard for personal investment tracking, built with React, Vite, Express, TypeScript, MongoDB Atlas, Recharts, TailwindCSS, React Router, Zustand, and Axios.

## Scripts

```bash
npm install
npm run dev
npm run build
npm run build:server
npm run build:client
npm run start:server
npm run lint
npm run typecheck
npm run test
```

The app uses MongoDB when `MONGODB_URI` is configured. Without MongoDB, it starts with empty in-memory data for local development.

## Environment

Create `apps/server/.env` from `apps/server/.env.example`.

```env
NODE_ENV=development
PORT=4000
MONGODB_URI=
FRONTEND_URL=http://localhost:5173
FRONTEND_URLS=
MARKET_DATA_PROVIDER=brapi
MARKET_DATA_API_KEY=
MARKET_TIMEZONE=America/Sao_Paulo
MARKET_REFRESH_HOURS=10:00,12:00,14:00,17:00
CDI_PROVIDER=bcb
CDI_RATE_FALLBACK=
CDI_TIMEZONE=America/Sao_Paulo
CDI_UPDATE_HOUR=8
ENABLE_SCHEDULERS=true
AI_ENABLED=true
AI_PROVIDER=groq
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b
GROQ_TIMEOUT_MS=120000
AI_ANALYSIS_CACHE_MINUTES=30
AI_MAX_REQUESTS_PER_HOUR=20
AI_CHAT_MAX_MESSAGES=20
AI_CHAT_MAX_CONTEXT_TOKENS=2200
```

Create `apps/client/.env` from `apps/client/.env.example`.

```env
VITE_API_URL=http://localhost:4000
```

Do not put `MONGODB_URI`, `MARKET_DATA_API_KEY`, passwords, or tokens in the frontend. Only variables prefixed with `VITE_` are available to the Vite client bundle.

## Inteligencia Artificial Com Groq

The AI assistant runs only in the backend. The frontend never receives `GROQ_API_KEY` and never calls Groq directly.

Backend variables:

- `AI_ENABLED=true` enables AI endpoints. Use `AI_ENABLED=false` to keep the app online without AI.
- `AI_PROVIDER=groq` uses Groq. Use `AI_PROVIDER=disabled` to force safe disabled mode.
- `GROQ_API_KEY` is the secret key from Groq and must exist only in `apps/server/.env` or Railway variables.
- `GROQ_MODEL=openai/gpt-oss-120b` is the default model.
- `GROQ_TIMEOUT_MS=120000` gives long analyses enough time.
- `AI_ANALYSIS_CACHE_MINUTES=30` reuses cached analyses when the backend context did not change.
- `AI_MAX_REQUESTS_PER_HOUR=20` applies a simple backend rate limit.
- `AI_CHAT_MAX_MESSAGES=20` limits messages per chat session.
- `AI_CHAT_MAX_CONTEXT_TOKENS=2200` caps context sent to the model; the backend also enforces an internal ceiling to keep common calls below roughly 3,000 input tokens.

If the key is missing, the deployment still works and the AI endpoints return friendly disabled responses instead of crashing.

Health check:

```bash
curl http://localhost:4000/api/ai/health
```

Main AI endpoints:

- `GET /api/ai/health`
- `POST /api/ai/analyses`
- `GET /api/ai/analyses`
- `POST /api/ai/projections/explain`
- `POST /api/ai/chat/sessions`
- `GET /api/ai/chat/sessions`
- `GET /api/ai/chat/sessions/:sessionId`
- `POST /api/ai/chat/sessions/:sessionId/messages`
- `DELETE /api/ai/chat/sessions/:sessionId`

### Assistente Estruturado E Acoes Confirmaveis

The financial assistant returns validated structured JSON instead of raw Markdown. The frontend renders the response as text, metric cards, tables, alerts, lists, suggestions, forms, confirmations, and success/error states. HTML returned by AI is not rendered.

Operational mode uses a safe pending-action flow:

1. The backend detects whether the message is a query or a write request.
2. Write requests are converted into an `AiPendingAction`.
3. Missing fields are requested as structured form fields.
4. A complete preview is shown to the user.
5. The action runs only after explicit confirmation (`Confirmar operacao` or a clear message such as `confirmo`).
6. Execution uses authorized backend services and validators, never direct AI writes to MongoDB.
7. The result is audited in `AiActionAudit` and returned as a structured success/error response.

Initial authorized tools:

- `createMonthlyExpense`
- `createContribution`
- `updateMonthlyIncome`
- `createFinancialGoal`
- `markExpenseAsCompleted`

Pending actions expire, are tied to a session and idempotency key, and are not executed twice. Destructive operations remain intentionally out of this first version.

## Structure

- `apps/client`: React + Vite frontend.
- `apps/server`: Express API, services, repositories, Mongoose models, validators, schedulers.

## API

- `GET /health`
- `GET /api/health`
- `GET /api/dashboard`
- `GET /api/assets`
- `GET /api/assets/:ticker`
- `GET /api/operations`
- `GET /api/dividends`
- `GET /api/contributions`
- `GET /api/goals`
- `POST /api/projections`
- `GET /api/market/status`
- `POST /api/market/refresh`
- `GET /api/calendar`
- `GET /api/history`
- `GET /api/settings`
- `PUT /api/settings/allocations`
- `GET /api/cdi/status`
- `POST /api/cdi/refresh`
- `GET /api/ai/health`
- `POST /api/ai/analyses`
- `POST /api/ai/projections/explain`

## Market Data And Schedulers

Market data, CDI, and cashbox yield jobs run only in the backend. The frontend never calls Banco Central directly. If no market provider/API key is configured, quotes are marked as unavailable and the app keeps the last valid quote instead of inventing prices.

CDI uses Banco Central do Brasil SGS series `12` (`Taxa de juros - CDI`, `% p.d.`) as the primary source through the public endpoint `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados`. The backend converts this daily percentage into:

- daily decimal rate used in calculations
- monthly equivalent rate when needed
- annual equivalent rate on a 252-business-day basis

If Banco Central is temporarily unavailable, the backend first reuses the last valid BCB rate already stored for the requested reference date range. Only when no valid stored rate is available does it fall back to `CDI_RATE_FALLBACK`. You can still force offline mode with `CDI_PROVIDER=fallback`.

Schedulers run Monday to Friday using `America/Sao_Paulo`:

- Market refresh: `MARKET_REFRESH_HOURS`.
- CDI update: `CDI_UPDATE_HOUR`.

Use `ENABLE_SCHEDULERS=false` for previews, tests, or temporary deployments where background jobs should not run.

## Deploy Do Backend No Railway

Recommended Railway configuration:

- Root Directory: `/`
- Build Command: `npm run build -w apps/server`
- Start Command: `npm run start -w apps/server`

Required variables:

- `NODE_ENV=production`
- `MONGODB_URI`
- `FRONTEND_URL`
- `FRONTEND_URLS` optional for explicit preview URLs
- `API_PUBLIC_URL=https://YOUR-RAILWAY-DOMAIN`
- `AUTH_COOKIE_SECURE=true`
- `AUTH_COOKIE_SAMESITE=lax`
- `MARKET_DATA_PROVIDER=brapi`
- `MARKET_DATA_API_KEY`
- `MARKET_TIMEZONE=America/Sao_Paulo`
- `MARKET_REFRESH_HOURS=10:00,12:00,14:00,17:00`
- `CDI_PROVIDER=bcb`
- `CDI_RATE_FALLBACK` optional fallback
- `CDI_TIMEZONE=America/Sao_Paulo`
- `CDI_UPDATE_HOUR=8`
- `ENABLE_SCHEDULERS=true`
- `AI_ENABLED=true`
- `AI_PROVIDER=groq`
- `GROQ_API_KEY`
- `GROQ_MODEL=openai/gpt-oss-120b`
- `GROQ_TIMEOUT_MS=120000`
- `AI_ANALYSIS_CACHE_MINUTES=30`
- `AI_MAX_REQUESTS_PER_HOUR=20`
- `AI_CHAT_MAX_MESSAGES=20`
- `AI_CHAT_MAX_CONTEXT_TOKENS=2200`

The backend uses `process.env.PORT` and listens on `0.0.0.0`, so do not configure a fixed production port.

After Railway generates the public domain, test:

```bash
curl https://YOUR-RAILWAY-DOMAIN/api/health
curl https://YOUR-RAILWAY-DOMAIN/api/ai/health
```

The health response includes only safe fields:

```json
{
  "status": "ok",
  "timestamp": "2026-07-24T00:00:00.000Z",
  "environment": "production",
  "database": "connected"
}
```

## MongoDB Atlas

- Railway must be able to access MongoDB Atlas.
- For the first deploy, Atlas may need a temporary `0.0.0.0/0` network access rule.
- Keep the database user/password strong.
- Never commit `MONGODB_URI` or real credentials.

## Deploy Do Frontend Na Vercel

Recommended Vercel configuration:

- Root Directory: `apps/client`
- Framework: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`

Recommended variable:

- `VITE_API_URL=` or `https://YOUR-VERCEL-DOMAIN`

Do not add backend secrets to Vercel. After Vercel deploys, copy the Vercel domain and update `FRONTEND_URL` in Railway. If you use explicit preview URLs, add them to `FRONTEND_URLS` as a comma-separated list.

For production, keep the SPA on its own Vercel origin and let `apps/client/vercel.json` proxy `/api/*` to Railway. The client prefers the current browser origin in production, even if an old cross-origin `VITE_API_URL` was left behind. This keeps session and CSRF cookies first-party in the browser, which is important for Safari/iOS.

Keep backend authentication cookies on `Secure=true`. Use `AUTH_COOKIE_SAMESITE=lax` for the normal same-origin browser flow; the backend automatically upgrades to `SameSite=None` only when a request is truly cross-site. The backend also exposes `X-CSRF-Token` for the SPA so authenticated `POST`, `PUT`, `PATCH`, and `DELETE` requests keep CSRF protection without exposing the session cookie.

`apps/client/vercel.json` proxies `/api/*` to Railway before rewriting every other route to `index.html`, so direct refreshes on `/carteira`, `/dividendos`, `/alocacao`, `/projecoes`, and `/caixinhas` still work with React Router.

## Favicon E Cache

The Vite frontend serves favicon files from `apps/client/public`, and Vercel copies them to the production `dist` root during build.

- Browser favicon: `apps/client/public/favicon.svg` and `apps/client/public/favicon-32x32.png`.
- Apple touch icon: `apps/client/public/apple-touch-icon.png`.
- To replace the logo later, update the files in `apps/client/public` and keep the same filenames, or change the links in `apps/client/index.html`.
- Browsers may cache favicons aggressively. If the old icon still appears, use a hard refresh with `Ctrl+Shift+R`.

## Ordem Correta De Deploy

1. Send the code to GitHub.
2. Create the Railway service from the repository root.
3. Add Railway environment variables.
4. Allow Railway access in MongoDB Atlas.
5. Deploy the backend.
6. Generate or copy the Railway public domain.
7. Test `GET /api/health`.
8. Create the Vercel project with root `apps/client`.
9. Remove old `VITE_API_URL` values that point to Railway. Optionally set `VITE_API_URL=https://YOUR-VERCEL-DOMAIN`, or leave it empty to use the current origin automatically.
10. Deploy the frontend.
11. Copy the Vercel production domain.
12. Update `FRONTEND_URL` in Railway with the Vercel domain and keep `NODE_ENV=production`.
13. Redeploy the backend.
14. Test the complete system in the browser.

## CORS

The backend accepts:

- Requests without `Origin`, such as health checks and API tools.
- `http://localhost:5173`
- `http://localhost:5174`
- `FRONTEND_URL`
- Each origin in `FRONTEND_URLS`

Unknown origins are rejected. The backend does not use `origin: "*"` with credentials.

## Validacao Da Integracao Do CDI

Use these checks after configuring the backend:

```bash
curl http://localhost:4000/api/cdi/status
curl -X POST http://localhost:4000/api/cdi/refresh
```

Expected fields in the response:

```json
{
  "success": true,
  "data": {
    "rate": 14.9,
    "referenceDate": "2026-07-24",
    "source": "bcb",
    "updatedAt": "2026-07-28T11:00:00.000Z"
  }
}
```

The values above are only an example of shape. The real `referenceDate` depends on the most recent value published by Banco Central on or before Tuesday, July 28, 2026.
