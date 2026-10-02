# Build context is the repo root (so we can pull in frontend/ and evaluation/).
#   docker build -f dashboard-bff/Dockerfile -t sentinelflow-dashboard .

# Stage 1 — build the React app in LIVE mode on Node 20 (host Node 25 deadlocks esbuild).
FROM node:20-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci || npm install
COPY frontend/ ./
# Same-origin API (served by this BFF) and live (non-mock) data.
ENV VITE_USE_MOCKS=false VITE_API_BASE_URL= VITE_AGENT_API_URL= VITE_POLL_INTERVAL_MS=4000
RUN npm run build

# Stage 2 — the FastAPI BFF that serves the build and proxies/aggregates the real services.
FROM python:3.12-slim AS serve
WORKDIR /srv
COPY dashboard-bff/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY dashboard-bff/app ./app
COPY --from=web /web/dist ./webdist
# Bundle the committed evaluation results so the Evaluation page shows real harness numbers.
COPY evaluation/results/results.json ./evaluation_results.json
EXPOSE 8090
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8090"]
