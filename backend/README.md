# Marine Oil-Spill Investigation API

Initial backend structure for the marine oil-spill investigation platform.

## Run locally

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
uvicorn app.main:app --reload
```

The health check is available at `GET http://localhost:8000/health`.

Set `DATABASE_URL` in `.env` before using SQLAlchemy or Alembic with PostgreSQL/PostGIS.
