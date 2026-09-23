# Deploy no EasyPanel

Crie três serviços App no mesmo projeto, conectados ao mesmo repositório e branch.
Use a **raiz do repositório** como diretório de build em todos eles: as aplicações
dependem de `packages/shared` e do `package-lock.json` da raiz.

## Builder automático (sem Docker local)

Selecione Nixpacks e configure Node 24 (`NIXPACKS_NODE_VERSION=24`).
Configure os comandos abaixo nas opções do builder de cada serviço.

| Serviço | Install | Build | Start | Porta interna |
| --- | --- | --- | --- | --- |
| web | `npm ci --include=dev` | `npm run build:web` | `npm run start:web` | 3000 |
| api | `npm ci --include=dev` | `npm run build:api` | `npm run start:api` | 3001 |
| worker | `npm ci --include=dev` | `npm run build:worker` | `npm run start:worker` | nenhuma |

Não use `npm run dev` nem o `npm start` da raiz no EasyPanel. Cada serviço
inicia somente seu processo. Não configure domínio ou healthcheck HTTP no worker.

## Variáveis

Copie os modelos de `deploy/*.env.example` para o editor de ambiente de cada
serviço e substitua os valores de exemplo. Não envie arquivos com credenciais ao Git.

API e worker devem apontar para o mesmo Supabase e Redis. Use o hostname interno
informado pelo EasyPanel para um Redis hospedado lá, nunca `localhost`.
No Redis, configure persistência e política `maxmemory-policy noeviction`.

No web, as três variáveis `NEXT_PUBLIC_*` precisam existir **durante o build**.
Ao mudar qualquer uma, faça um novo build. Não coloque a service role no web.

## Domínios

- Web: `https://painel.seudominio.com`, encaminhado à porta 3000.
- API: `https://api.seudominio.com`, encaminhado à porta 3001.
- Configure `NEXT_PUBLIC_API_URL` com a URL HTTPS da API.
- Configure `CORS_ORIGINS` na API com a URL HTTPS do painel, sem barra final.
  Para mais de uma origem, separe por vírgula.
- Ajuste as URLs permitidas do Supabase Auth para o domínio do painel caso utilize
  redirecionamentos de autenticação.

## Banco e publicação

Se mantiver o Supabase atual, mantenha os dados e migrations já aplicadas.
Para um banco novo, aplique `supabase/migrations/001_initial_schema.sql` e depois
`002_add_reception_destinations.sql`. Cadastre o usuário administrador no Supabase
Auth e configure seu UUID como `ADMIN_USER_ID` na API.

Publique API e worker; depois publique o web. Confirme:

1. `GET https://api.seudominio.com/health` responde.
2. Login do administrador funciona no painel.
3. Dashboard mostra Redis, banco e worker disponíveis.
4. Uma recepção vinculada encaminha um JSON de teste ao destino esperado.

Requisições usam `https://api.seudominio.com/v1/requests/ID_DA_RECEPCAO`
com `Authorization: Bearer SUA_CHAVE`.

## Alternativa com Dockerfile

Os Dockerfiles também usam contexto na raiz. Selecione o caminho correspondente:
`apps/web/Dockerfile`, `apps/api/Dockerfile` ou `apps/worker/Dockerfile`.
O Dockerfile web declara os três argumentos públicos de build. Não passe segredos
privados como build args. O EasyPanel faz o build no servidor.

O `docker-compose.yml` existente é de desenvolvimento; não use como configuração
de produção do EasyPanel.

## Verificação local

Com Node 24 e variáveis configuradas:

```sh
npm ci
npm run build
npm run type-check
npm test
```

A credencial real removida de `.env.example` deve ser substituída no provedor Redis
antes da publicação se foi compartilhada ou enviada ao repositório. Atualize API e
worker juntos. A remoção do arquivo não apaga versões anteriores do Git.

Referências: https://easypanel.io/docs/services/app e https://easypanel.io/docs/builders
