# Customer Complaint Portal — build the Vite SPA, serve it with nginx.
# Build context is the REPO ROOT (workspaces).
#   docker build -f web/customer-portal/Dockerfile --build-arg VITE_API_URL=http://localhost:4000 -t trustdesk-customer .

FROM node:22-slim AS build
WORKDIR /app
# Baked into the bundle at build time (the browser calls the API directly).
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL

# Workspace manifests, then install ONLY this portal's workspace (no backend / native deps).
COPY package.json package-lock.json* ./
COPY backend/package.json ./backend/
COPY web/customer-portal/package.json ./web/customer-portal/
COPY web/agent-portal/package.json ./web/agent-portal/
RUN npm install -w web/customer-portal

COPY web/customer-portal ./web/customer-portal
RUN npm run build -w web/customer-portal

FROM nginx:alpine AS runtime
COPY docker/nginx.spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/customer-portal/dist /usr/share/nginx/html
EXPOSE 80
