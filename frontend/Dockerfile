# Multi-stage build for the SentinelFlow dashboard.
# Stage 1 builds the static bundle on Node 20 LTS (the host's Node 25 deadlocks esbuild's service).
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY . .
# Bake env at build time (override with --build-arg). Defaults keep mock mode on.
ARG VITE_USE_MOCKS=true
ARG VITE_API_BASE_URL=http://localhost:8080
ARG VITE_AGENT_API_URL=http://localhost:8000
ENV VITE_USE_MOCKS=$VITE_USE_MOCKS VITE_API_BASE_URL=$VITE_API_BASE_URL VITE_AGENT_API_URL=$VITE_AGENT_API_URL
RUN npm run build

# Stage 2 serves the static files with nginx (SPA fallback to index.html).
FROM nginx:1.27-alpine AS serve
COPY --from=build /app/dist /usr/share/nginx/html
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  location / { try_files $uri /index.html; }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
