# PCCraft Marketplace

> Production-grade multi-vendor e-commerce platform for computers, laptops,
> peripherals, and PC components — with a data-driven PC compatibility
> checker, multi-algorithm recommendation engine, trade-licensed vendor
> verification, and structured returns/refund workflow.

---

## Overview

PCCraft Marketplace is a semester submission built to commercial standards.
It implements a fully decoupled React 19 + Vite frontend and a Django 6
REST API backend with PostgreSQL 18 full-text search, Redis 7 caching, and
Celery background tasks.

The complete behaviour contract for every endpoint, model field, component,
store key, and route is defined in [`PCCraft_Master_Spec_v4.md`](./PCCraft_Master_Spec_v4.md).
That file is the single source of truth for what to build — if something is
not there, it is out of scope.

## Tech Stack

| Layer       | Choice                                                              |
|-------------|---------------------------------------------------------------------|
| Frontend    | React 19, Vite 6, Tailwind CSS v4, React Router v8, Zustand 5       |
| Backend     | Django 6, Django REST Framework 3.15, SimpleJWT, drf-spectacular     |
| Database    | PostgreSQL 18 (`SearchVectorField`, `GinIndex`)                     |
| Cache / MQ  | Redis 7, Celery 5                                                   |
| Auth        | JWT (15 min access / 7 day refresh, rotation + blacklist)            |
| Search      | PostgreSQL full-text + custom similarity fallback                   |

## Prerequisites

- Node.js **22+** (tested with 24)
- Python **3.12+** (spec target 3.14, conda env at 3.12 verified to work)
- PostgreSQL **18+**
- Redis **7+**

## Quick Start

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # or use your preferred env manager
pip install -r requirements.txt
cp ../.env.example .env                              # then edit credentials
python manage.py migrate
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
cp ../.env.example .env                              # rename / fill VITE_API_BASE_URL
npm run dev
```

The Vite dev server runs on `http://localhost:5173`. The API runs on
`http://localhost:8000`. Swagger UI is served at `/api/docs/`.

## Environment Variables

See [`.env.example`](./.env.example) for the canonical list. Backend reads
via `python-decouple`; frontend reads via Vite's `import.meta.env` prefixed
with `VITE_`.

## Folder Structure (summary)

```
PCCraft_Marketplace/
├── backend/          Django project (config/) + apps/
├── frontend/         Vite + React 19 app
├── docs/             SRS, proposal, API reference, architecture, ERD
├── assets/           Design source files (logo, banners, mockups)
├── screenshots/      UI captures for the README
├── PCCraft_Master_Spec_v4.md   ← single source of truth
├── CLAUDE.md                   ← build protocol for the agent
└── README.md                   ← this file
```

Detailed architecture decisions live in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## License

[MIT](./LICENSE)