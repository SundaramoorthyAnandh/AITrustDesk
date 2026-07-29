# Agent Console — build the Vite SPA, serve it with nginx.
# Build context is the REPO ROOT (workspaces).
#   docker build -f web/agent-portal/Dockerfile --build-arg VITE_API_URL=http://localhost:4000 -t trustdesk-agent .

FROM node:22-slim AS build
WORKDIR /app
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL

COPY package.json package-lock.json* ./
COPY backend/package.json ./backend/
COPY web/customer-portal/package.json ./web/customer-portal/
COPY web/agent-portal/package.json ./web/agent-portal/
RUN npm install -w web/agent-portal

COPY web/agent-portal ./web/agent-portal
RUN npm run build -w web/agent-portal

FROM nginx:alpine AS runtime
COPY docker/nginx.spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/agent-portal/dist /usr/share/nginx/html
EXPOSE 80
