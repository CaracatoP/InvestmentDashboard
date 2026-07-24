# Investment Dashboard

Full-stack dashboard for personal investment tracking, built with React, Express, MongoDB-ready models, Recharts, Framer Motion, TailwindCSS, React Router, Zustand, and Axios.

## Scripts

```bash
npm install
npm run dev
```

The app uses MongoDB when `MONGODB_URI` is configured. Without MongoDB, it starts with an empty in-memory store for local development.

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
- `GET /api/calendar`
- `GET /api/history`
- `GET /api/settings`
- `PUT /api/settings/allocations`
