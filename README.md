# Investment Dashboard

Full-stack dashboard for personal investment tracking, built with React, Express, MongoDB-ready models, Recharts, Framer Motion, TailwindCSS, React Router, Zustand, and Axios.

## Scripts

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run build
```

The app uses MongoDB when `MONGODB_URI` is configured. Without MongoDB, it starts with an empty in-memory store for local development.

## Environment

Create `apps/server/.env` from `apps/server/.env.example`.

```env
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/investment-dashboard?retryWrites=true&w=majority
MARKET_DATA_PROVIDER=brapi
MARKET_DATA_API_KEY=
MARKET_TIMEZONE=America/Sao_Paulo
MARKET_REFRESH_HOURS=10:00,12:00,14:00,17:00
```

Market data runs only in the backend. If no provider/API key is configured, quotes are marked as unavailable and the app keeps the last valid quote instead of inventing prices.

The scheduler refreshes quotes Monday to Friday at `10:00`, `12:00`, `14:00`, and `17:00` in `America/Sao_Paulo`. The scheduler has a hot-reload guard to avoid duplicated jobs during `tsx watch`.

## Structure

- `apps/client`: React + Vite frontend
- `apps/server`: Express API, services, repositories, Mongoose models, validators

## API

- `GET /health`
- `GET /api/dashboard`
- `GET /api/assets`
- `GET /api/assets/:ticker`
- `GET /api/dividends`
- `GET /api/contributions`
- `POST /api/contributions`
- `GET /api/goals`
- `POST /api/goals`
- `POST /api/projections`
- `GET /api/market/status`
- `POST /api/market/refresh`
- `GET /api/calendar`
- `GET /api/history`
- `GET /api/settings`
- `PUT /api/settings/allocations`
