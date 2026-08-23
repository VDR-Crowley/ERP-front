# Deploy do ERP-front no Railway

## Contexto

Este app é Angular SSR (Angular Universal): `provideClientHydration`, servidor
Node/Express gerado no build (`dist/erp-front/server/server.mjs`). Não é site
estático — a detecção automática do Railway (Nixpacks) tenta servir como
estático e falha, porque o output real do `ng build` não fica em `/app/browser`
na raiz do projeto.

## Causa do erro original

```
copy /app/browser
Build Failed: ... failed to calculate checksum of ref ...: "/app/browser": not found
```

Nixpacks (config gerada automaticamente pelo Railway, sem `Dockerfile` no
repo) assumia output estático em `/app/browser`. O `ng build` real (Angular 21,
`@angular/build:application`) gera:

```
dist/erp-front/
├── browser/   ← estáticos (index.html, JS, CSS, assets)
└── server/    ← server.mjs (Express/SSR) + chunks server-side
```

`server.mjs` resolve os estáticos com `join(import.meta.dirname, "../browser")`
— ou seja, as duas pastas precisam ficar uma ao lado da outra, na mesma
posição relativa do build. Path errado = erro de checksum/copy no Nixpacks.

## Solução

`Dockerfile` na raiz do repo com build stage (`npm ci` + `ng build --configuration
production`) e runtime stage que copia só `dist/erp-front/browser` e
`dist/erp-front/server` mantendo a posição relativa, e roda:

```
node dist/erp-front/server/server.mjs
```

Railway detecta o `Dockerfile` automaticamente e passa a usar ele em vez de
Nixpacks — não precisa configurar nada a mais no painel pra isso.

## Porta

`server.mjs` lê `process.env.PORT` (fallback `4000`). Railway injeta `PORT`
automaticamente no container — nenhuma variável extra precisa ser criada pra
isso, só garantir que o serviço não tem `PORT` fixo sobrescrito manualmente no
painel.

## URL do backend

`apiUrl` de produção é **hardcoded** em `src/environments/environment.production.ts`
(usado no build via `fileReplacements`, ver `angular.json`):

```
https://laravel-production-4c67.up.railway.app/api
```

Prefixo `/api` confirmado em `ERP-Backend/routes/api.php` +
`bootstrap/app.php` (`withRouting(api: ...)`, sem override de prefixo — padrão
Laravel).

### Por que hardcode e não env var do Railway

`apiUrl` é lido em código Angular que roda tanto no browser quanto no
servidor SSR, e é decidido em **build time** via `fileReplacements`
(`environment.ts` → `environment.production.ts`). Pra virar variável do
Railway em runtime seria preciso ou:
- rebuild disparado por env var do Railway como build arg (`ARG`/`ENV` no
  Dockerfile lendo do painel), ou
- um mecanismo de config injetada em runtime (endpoint `/config.json` lido no
  bootstrap, por exemplo).

Nenhuma credencial fica exposta na URL (é só o host do backend, público por
natureza — o front precisa expor isso ao browser de qualquer forma). Hardcode
no arquivo de ambiente é mais simples, mais previsível (sem risco de var não
configurada derrubar o app em produção) e suficiente pro tamanho do projeto.
Se o domínio do backend mudar, é um commit trocando essa linha.

## Variáveis a configurar no painel do Railway

Nenhuma variável obrigatória além do que o Railway já injeta (`PORT`).

Opcional, se o app apresentar warning de host não permitido em produção
(proteção SSRF nativa do Angular SSR contra DNS rebinding) — não deve
acontecer com o domínio público real do Railway, só ocorreu localmente ao
simular `Host: localhost` diretamente:

- `NG_ALLOWED_HOSTS`: lista de hosts extras permitidos, separados por vírgula.
- `NG_TRUST_PROXY_HEADERS`: se precisar confiar em `X-Forwarded-*` de um proxy
  na frente do Railway.

## Checklist de deploy

1. `Dockerfile` no repo (raiz) — Railway detecta e builda automaticamente.
2. Nenhuma env var obrigatória a configurar no painel (`PORT` é injetada pelo
   Railway).
3. Confirmar que o serviço do backend (`laravel-production-4c67.up.railway.app`)
   está no ar antes de testar login/rotas autenticadas no front.
4. Após deploy, testar uma rota SSR (ex: `/login`) e uma chamada de API real
   pra confirmar CORS/prefixo `/api` batendo com o backend.

## Verificação local (sem Docker)

```bash
npx ng build --configuration production
PORT=4000 node dist/erp-front/server/server.mjs
```

Testado localmente: build gera a estrutura acima, servidor sobe e responde
200 em `/login` com host real (falha só com `Host: localhost`, esperado —
proteção SSRF do Angular, não afeta domínio público do Railway).
