# Truck HOS Frontend - React + Vite (multi-stage)
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (npm install so lock file need not be in sync with package.json)
COPY package.json package-lock.json ./
RUN npm install

# Build args for Vite env (baked in at build time)
# Use /api so nginx can proxy to backend - no host needed at build time
ARG VITE_API_BASE_URL=/api
ARG VITE_MAPBOX_TOKEN=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN

COPY . .
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html/driversdailylogbook
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
