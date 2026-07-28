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
```

Create `apps/client/.env` from `apps/client/.env.example`.

```env
VITE_API_URL=http://localhost:4000
```

Do not put `MONGODB_URI`, `MARKET_DATA_API_KEY`, passwords, or tokens in the frontend. Only variables prefixed with `VITE_` are available to the Vite client bundle.

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
- `MARKET_DATA_PROVIDER=brapi`
- `MARKET_DATA_API_KEY`
- `MARKET_TIMEZONE=America/Sao_Paulo`
- `MARKET_REFRESH_HOURS=10:00,12:00,14:00,17:00`
- `CDI_PROVIDER=bcb`
- `CDI_RATE_FALLBACK` optional fallback
- `CDI_TIMEZONE=America/Sao_Paulo`
- `CDI_UPDATE_HOUR=8`
- `ENABLE_SCHEDULERS=true`

The backend uses `process.env.PORT` and listens on `0.0.0.0`, so do not configure a fixed production port.

After Railway generates the public domain, test:

```bash
curl https://YOUR-RAILWAY-DOMAIN/api/health
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

Required variable:

- `VITE_API_URL=https://YOUR-RAILWAY-DOMAIN`

Do not add backend secrets to Vercel. After Vercel deploys, copy the Vercel domain and update `FRONTEND_URL` in Railway. If you use explicit preview URLs, add them to `FRONTEND_URLS` as a comma-separated list.

`apps/client/vercel.json` rewrites every route to `index.html`, so direct refreshes on `/carteira`, `/dividendos`, `/alocacao`, `/projecoes`, and `/caixinhas` work with React Router.

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
9. Add `VITE_API_URL=https://YOUR-RAILWAY-DOMAIN`.
10. Deploy the frontend.
11. Copy the Vercel production domain.
12. Update `FRONTEND_URL` in Railway with the Vercel domain.
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
