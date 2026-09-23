# Request Manager

Uma aplicação web para receber requisições HTTP de diferentes sistemas e encaminhá-las para destinos configuráveis, controlando a cadência e a concorrência dos envios.

## 📋 Visão Geral

O Request Manager funciona como uma camada intermediária assíncrona:

1. Um sistema de origem envia uma requisição para o Request Manager
2. A API valida e registra a requisição
3. A requisição é colocada em uma fila
4. O worker processa a fila respeitando as configurações
5. A requisição é encaminhada ao destino definido
6. O resultado é registrado para consulta no painel

## 🏗️ Arquitetura

### Stack Técnico

- **Frontend:** Next.js
- **Backend/API:** Node.js + Fastify
- **Fila e Processamento:** BullMQ
- **Coordenação de Fila:** Redis
- **Banco Persistente:** Supabase PostgreSQL
- **Linguagem:** TypeScript

### Estrutura de Serviços

- `request-manager-web` - Painel administrativo Next.js
- `request-manager-api` - API Fastify para recebimento de requisições
- `request-manager-worker` - Worker BullMQ para processamento de filas
- `request-manager-redis` - Serviço Redis privado

## 🚀 Início Rápido

### Pré-requisitos

- Node.js >= 18.0.0
- npm >= 9.0.0
- Docker e Docker Compose (para execução em contêiner)

### Instalação Local

1. Clone o repositório:

```bash
git clone <repo-url>
cd request-manager
```

2. Copie as variáveis de ambiente:

```bash
cp .env.example .env
```

3. Configure suas credenciais no `.env`:
   - Credenciais do Supabase
   - URLs de base da API
   - Configurações do Redis

4. Instale as dependências:

```bash
npm install
```

5. Execute as migrations do banco de dados (quando usar Supabase):

```bash
# Através do Supabase CLI (quando disponível)
supabase db push
```

6. Inicie o desenvolvimento:

```bash
npm run dev
```

Isso iniciará simultaneamente:
- Web (http://localhost:3000)
- API (http://localhost:3001)
- Worker (ouve a fila Redis)

### Desenvolvimento com Docker

Execute todos os serviços com Docker Compose:

```bash
docker-compose up
```

Isso inicia:
- Redis em `localhost:6379`
- API em `localhost:3001`
- Web em `localhost:3000`
- Worker processando a fila

Para parar:

```bash
docker-compose down
```

## 📦 Estrutura do Projeto

```
request-manager/
├── apps/
│   ├── web/                 # Painel Next.js
│   │   ├── src/
│   │   ├── public/
│   │   ├── package.json
│   │   └── Dockerfile
│   ├── api/                 # API Fastify
│   │   ├── src/
│   │   ├── package.json
│   │   └── Dockerfile
│   └── worker/              # Worker BullMQ
│       ├── src/
│       ├── package.json
│       └── Dockerfile
├── packages/
│   └── shared/              # Tipos e utilitários compartilhados
│       └── src/
├── supabase/
│   └── migrations/          # Migrations SQL do banco
├── .env.example             # Exemplo de variáveis de ambiente
├── docker-compose.yml       # Orquestração local
├── tsconfig.json           # Configuração TypeScript base
└── README.md               # Este arquivo
```

## 🔧 Scripts Disponíveis

### Na Raiz

```bash
npm run dev          # Inicia desenvolvimento (all services)
npm run build        # Compila todos os workspaces
npm run start        # Inicia produção (all services)
npm run lint         # Executa linter em todos os packages
npm run type-check   # Verifica tipos TypeScript
```

### Por Workspace

```bash
npm run dev --workspace=apps/web
npm run build --workspace=apps/api
npm run type-check --workspace=apps/worker
```

## 🔑 Variáveis de Ambiente

Veja `.env.example` para todas as variáveis disponíveis:

- `NODE_ENV` - Ambiente (development/production)
- `API_PORT` - Porta da API (padrão: 3001)
- `WEB_PORT` - Porta do painel (padrão: 3000)
- `SUPABASE_URL` - URL do projeto Supabase
- `SUPABASE_ANON_KEY` - Chave pública do Supabase
- `SUPABASE_SERVICE_ROLE_KEY` - Chave de serviço (não exponha no frontend)
- `REDIS_HOST` - Host do Redis
- `REDIS_PORT` - Porta do Redis
- `INTERNAL_API_SECRET` - Secret compartilhado entre serviços

## 📚 Endpoints da API

### Saúde

- `GET /health` - Status do serviço

### Requisições (v1)

- `POST /v1/requests` - Enfileirar nova requisição (retorna 202 Accepted)
- `GET /v1/requests/:id` - Consultar status da requisição

## 🛠️ Desenvolvimento

### Adicionar Dependências

```bash
# Na raiz
npm install --workspace=apps/api axios

# Direto no workspace
cd apps/api && npm install axios
```

### Type Checking

```bash
npm run type-check
```

### Linting

```bash
npm run lint
```

## 🐳 Deployment com Docker

### Build de Imagens

```bash
docker-compose build
```

### Push para Registry

Configure suas credenciais e:

```bash
docker tag request-manager-api <registry>/request-manager-api:latest
docker push <registry>/request-manager-api:latest
```

### EasyPanel

Consulte a documentação de implantação para configurar os quatro serviços no EasyPanel:
1. request-manager-web (Next.js)
2. request-manager-api (Fastify)
3. request-manager-worker (BullMQ)
4. request-manager-redis (Redis - privado)

## 🔒 Segurança

- As credenciais do Supabase (`SUPABASE_SERVICE_ROLE_KEY`) nunca devem ser expostas no frontend
- Use apenas `SUPABASE_ANON_KEY` no cliente web
- Redis deve estar protegido e não exposto à internet pública
- Implemente validação de origem para proteção SSRF
- Não registre segredos, cabeçalhos de autenticação ou dados sensíveis

## 📝 Licença

Proprietary - Tetra Educação
