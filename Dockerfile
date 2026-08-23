# syntax=docker/dockerfile:1

# --- build stage -------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx ng build --configuration production

# --- runtime stage -------------------------------------------------------
# Angular 21 (@angular/build:application) gera dist/erp-front/browser
# (estáticos) e dist/erp-front/server (server.mjs, SSR Node/Express).
# server.mjs resolve estáticos em `../browser` relativo a si mesmo, então
# as duas pastas precisam manter essa posição relativa no runtime.
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/dist/erp-front/browser ./dist/erp-front/browser
COPY --from=build /app/dist/erp-front/server ./dist/erp-front/server

# Railway injeta PORT em runtime; server.mjs lê process.env.PORT (fallback 4000).
EXPOSE 4000
CMD ["node", "dist/erp-front/server/server.mjs"]
