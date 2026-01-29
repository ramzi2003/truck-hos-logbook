# Truck HOS Trip Planner

Full‑stack demo app for planning truck trips under FMCSA HOS rules. The backend is a Django REST API and the frontend is a React + Vite SPA.

## Backend (Django)

- `backend/` Django project configured with:
  - Django REST Framework
  - SimpleJWT for access/refresh tokens
  - CORS support for the Vercel frontend
- Apps:
  - `accounts` – register/login/refresh JWT endpoints
  - `trips` – `/api/trips/plan` endpoint plus Mapbox + HOS logic

### Running locally

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

set MAPBOX_ACCESS_TOKEN=YOUR_MAPBOX_TOKEN_HERE

cd backend
python manage.py migrate
python manage.py runserver
```

The API will be available at `http://localhost:8000/api/`.

### Key endpoints

- `POST /api/auth/register/` – create a user (`username`, `email`, `password`)
- `POST /api/auth/login/` – returns `{ access, refresh }` JWT tokens
- `POST /api/auth/refresh/` – refreshes access token
- `POST /api/trips/plan` – authenticated; body:

```json
{
  "current_location": "Dallas, TX",
  "pickup_location": "Oklahoma City, OK",
  "dropoff_location": "Denver, CO",
  "current_cycle_hours_used": 0,
  "departure_datetime": "2025-01-01T08:00:00Z"
}
```

Response includes:

- Route summary: total distance (meters) and duration (seconds)
- Geometry polyline as `[lon, lat]` pairs for map rendering
- `logs`: array of daily ELD‑style logs (`OFF`, `SB`, `D`, `ON` segments with timestamps)
- `instructions`: human‑readable sequence of pickups, driving blocks, breaks, fuel stops, overnights, and drop‑off.

### HOS assumptions / simplifications

- Property‑carrying, solo driver, 70hr/8‑day cycle, no adverse weather or short‑haul exceptions.
- Enforces:
  - 11 driving hours / day
  - 14 on‑duty hours / day
  - 10 consecutive hours off between days
  - 30‑minute break after 8 hours of driving
  - 34‑hour restart when 70‑hour cycle limit is hit
  - 1 hour ON duty at pickup and 1 hour at drop‑off
  - Fuel stop every ~1000 miles as 30 minutes ON duty
- Time zone is treated as a single fixed zone (UTC) for simplicity; in production you would use the driver’s home terminal time zone and proper localization.
- This is **not production‑grade legal compliance** but a close approximation for this assessment.

## Frontend (React + Vite)

Located under `frontend/`.

### Running locally

```bash
cd frontend
npm install
npm run dev
```

Configure environment variables in `frontend/.env`:

```bash
VITE_API_BASE_URL=http://localhost:8000/api
VITE_MAPBOX_TOKEN=YOUR_MAPBOX_TOKEN_HERE
```

Then open the dev server URL (typically `http://localhost:5173`).

### Screens

- **Register / Login** – clean, centered card layout with validation and error states. On login, access/refresh tokens are stored in `localStorage` and added as `Authorization: Bearer` headers on API calls.
- **Planner** – split layout:
  - Left: trip form (`Current location`, `Pickup`, `Dropoff`, `Current cycle used`, optional departure).
  - Right: text route instructions plus scrollable daily HOS logs rendered as SVG ELD‑style charts.

> Note: Mapbox map rendering is wired via the backend geometry output and the `geometry` field in the planner response; for deployment you can plug this into `mapbox-gl` or `react-map-gl` using the same coordinates array.

## Docker deployment (recommended for self-hosting)

### After you pull on the server — do this:

1. **Go into the project directory**
   ```bash
   cd /path/to/truck-drivers-log   # or wherever you cloned/pulled
   ```

2. **Create `backend/.env`** (if it doesn’t exist) with at least:
   ```bash
   DJANGO_SECRET_KEY=your-long-random-secret-key-here
   DJANGO_DEBUG=False
   POSTGRES_DB=truck_hos
   POSTGRES_USER=truck_hos
   POSTGRES_PASSWORD=your-secure-postgres-password
   MAPBOX_ACCESS_TOKEN=your-mapbox-token-if-you-use-maps
   ```
   Use a strong random value for `DJANGO_SECRET_KEY` and `POSTGRES_PASSWORD`.

3. **(Optional)** If the frontend needs Mapbox at build time, set the token before building:
   ```bash
   export VITE_MAPBOX_TOKEN=your-mapbox-token
   ```
   Or add it to `frontend/.env` and run: `export $(grep VITE_MAPBOX_TOKEN frontend/.env | xargs)` before the next step.

4. **Build and start**
   ```bash
   docker compose up -d --build
   ```
   First run may take a few minutes (build + DB migrations).

5. **Check it’s running**
   - App: `http://YOUR_SERVER_IP:8082/driversdailylogbook/`
   - API: `http://YOUR_SERVER_IP:8082/api/`
   - Logs: `docker compose logs -f`

6. **Later: stop / restart**
   ```bash
   docker compose down      # stop
   docker compose up -d      # start again
   ```

Uses your existing **backend/.env** and **frontend/.env** — no root `.env` needed.

- **Frontend**: http://localhost:8082/driversdailylogbook/ (or your server IP) — port **8082** (80, 8080, 8081 are often in use on shared servers). Change `ports: "8082:80"` in `docker-compose.yml` if you need another port. `/` redirects to `/driversdailylogbook/`
- **API**: Proxied at `/api` (same origin; nginx in the frontend container forwards to the backend)
- **Database**: PostgreSQL in Docker volume `postgres_data` (persists across restarts)

**If you proxy from your main server on port 80**: proxy to this app on 8082, e.g. `location /driversdailylogbook/ { proxy_pass http://localhost:8082/driversdailylogbook/; }` and `location /api/ { proxy_pass http://localhost:8082/api/; }` so users hit `https://yourserver/driversdailylogbook/` and `https://yourserver/api/`.

Backend reads **backend/.env**. For the server, the app uses **PostgreSQL** (in Docker). In **backend/.env** set:

- `POSTGRES_DB` (e.g. `truck_hos`)
- `POSTGRES_USER` (e.g. `truck_hos`)
- `POSTGRES_PASSWORD` (required)

Compose adds `POSTGRES_HOST=db` and `DJANGO_ALLOWED_HOSTS` for the container. Data is stored in the `postgres_data` volume. Frontend build gets `VITE_MAPBOX_TOKEN` from your environment when you run `docker compose build` (or `up`); use the export line above if your token lives only in **frontend/.env**.

---

## Deployment notes (non-Docker)

Backend (Django):

- Deploy to a Django‑friendly host (Render/Railway/etc.).
- Set environment variables:
  - `SECRET_KEY`
  - `DEBUG=False`
  - `ALLOWED_HOSTS=your-backend-host`
  - `MAPBOX_ACCESS_TOKEN=...`
  - `FRONTEND_ORIGIN=https://your-frontend.vercel.app`
- Run migrations and point `VITE_API_BASE_URL` in the frontend to the live backend URL.

Frontend (Vercel):

- Import the `frontend` folder as a Vercel project.
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables:
  - `VITE_API_BASE_URL=https://your-backend-host/api`
  - `VITE_MAPBOX_TOKEN=...`

## Loom walkthrough outline

1. Show registration and login flow.
2. Enter a sample trip and highlight the generated instructions and daily logs.
3. Briefly walk the code:
   - `trips/hos_engine.py` – HOS scheduling logic.
   - `trips/views.py` – `/api/trips/plan` endpoint and Mapbox integration.
   - `frontend/src/pages/TripPlannerPage.tsx` and `frontend/src/components/HosLog.tsx` – planner UI and SVG log rendering.

