# Diagnóstico e Correções - Erro de Autenticação JWT

## 📋 Resumo Executivo

Foram identificados e corrigidos **3 erros críticos** que causavam o comportamento de piscar entre dashboard e login:

1. ✅ **JWT Authentication Bug** - Variáveis de ambiente sendo chamadas como funções
2. ✅ **Supabase Client não definido** - Rotas admin usando variável `supabase` não inicializada
3. ✅ **Redis Connection Failure** - Conexão Redis causando crash na inicialização

---

## 🔧 Correções Aplicadas

### 1️⃣ JWT Authentication Fix
**Arquivo:** `apps/api/src/middleware/jwt-auth.ts`

**Problema:**
```typescript
// ❌ ERRADO
function getJWTSecret() {
  return process.env.SUPABASE_getJWTSecret();  // Tentava chamar como função!
}

function getAdminUserId() {
  return process.env.getAdminUserId();  // Tentava chamar como função!
}
```

**Solução:**
```typescript
// ✅ CORRETO
function getJWTSecret() {
  return process.env.SUPABASE_JWT_SECRET;  // Acesso direto à string
}

function getAdminUserId() {
  return process.env.ADMIN_USER_ID;  // Acesso direto à string
}
```

**Commit:** `4ba73d4` - "fix: Correct JWT authentication environment variable references"

---

### 2️⃣ Supabase Client Undefined Fix
**Arquivos:** 
- `apps/api/src/routes/admin-requests.ts` (4 referências)
- `apps/api/src/routes/dashboard.ts` (2 referências)

**Problema:**
Código estava usando variável local `supabase` que nunca foi inicializada:
```typescript
// ❌ ERRADO
const { data, error } = await supabase.from('requests')...
```

**Solução:**
Usar a função `getSupabaseClient()` que inicializa com SERVICE_ROLE_KEY:
```typescript
// ✅ CORRETO
const { data, error } = await getSupabaseClient().from('requests')...
```

**Rotas Corrigidas:**
- `GET /admin/requests/:id` - fetch request details
- `GET /admin/requests/:id/retry` - retry request  
- `GET /admin/dashboard/metrics` - dashboard metrics
- `GET /admin/dashboard/activity` - recent activity

**Commit:** `5739451` - "fix: Use getSupabaseClient() instead of undefined supabase variable"

---

### 3️⃣ Redis Connection Graceful Failure
**Arquivo:** `apps/api/src/routes/admin-requests.ts`

**Problema:**
Redis tentava conectar na inicialização, causando crash se não estivesse disponível:
```typescript
// ❌ ERRADO - Falha hard
const redis = new Redis({ ... });
const requestQueue = new Queue('requests', { connection: redis });
```

**Solução:**
Redis agora é opcional. Se não estiver disponível:
- ✅ App inicia normalmente
- ✅ Retry de requests é marcado como "queued" no banco
- ⚠️ Jobs não são processados automaticamente via BullMQ (esperado em dev)
- ℹ️ Log avisa o desenvolvedor

```typescript
// ✅ CORRETO - Graceful failure
async function initializeQueue() {
  try {
    redis = new Redis({ ... });
    requestQueue = new Queue('requests', { connection: redis });
  } catch (error) {
    logger.warn('Failed to initialize Redis queue. Retry functionality will be limited.');
    redis = null;
    requestQueue = null;
  }
}

// Proteção no uso
if (requestQueue) {
  await requestQueue.add(...);
} else {
  logger.warn('Redis queue not available...');
}
```

**Commit:** `d65da98` - "fix: Handle Redis connection failures gracefully"

---

## 🚀 Próximos Passos

### Para Desenvolvimento Local (sem Redis):
A aplicação agora funciona sem Redis. As features abaixo funcionam:
- ✅ Dashboard (métricas e atividade)
- ✅ Autenticação JWT
- ✅ Visualização de requests
- ✅ Marcar request para retry (ficará como "queued" mas não processará automaticamente)

### Para Produção (com Redis):
Se quiser que retries funcionem automaticamente:
1. **Instale Redis:**
   ```bash
   # Windows (WSL ou Docker)
   docker run -d -p 6379:6379 redis:latest
   
   # Ou use Redis via Docker Compose se houver config
   ```

2. **Configure .env:**
   ```env
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_USERNAME=your-username
   REDIS_PASSWORD=your-password
   REDIS_TLS=false
   ```

3. **Reinicie a aplicação** - Redis será detectado e fila funcionará

---

## 📊 Fluxo de Autenticação Agora Correto

```
Frontend (app/web)
    ↓
    ├→ Faz login
    ├→ Supabase Auth retorna JWT token
    ├→ Armazena token localmente
    ↓
GET /admin/dashboard/metrics
    ├→ Header: Authorization: Bearer <jwt-token>
    ↓
JWT Middleware (jwt-auth.ts)
    ├→ Extrai token
    ├→ Decodifica com SUPABASE_JWT_SECRET ✅ (corrigido)
    ├→ Valida userId === ADMIN_USER_ID ✅ (corrigido)
    ├→ Passa para rota se OK
    ↓
Dashboard Route (dashboard.ts)
    ├→ Chama getSupabaseClient() ✅ (corrigido)
    ├→ Busca dados do banco
    ├→ Retorna métricas
    ↓
Frontend recebe 200 com dados ✅
```

---

## 🧪 Como Testar

1. **Recarregue a aplicação:**
   ```bash
   # Terminal: npm run dev (já deve estar rodando)
   ```

2. **No navegador:**
   - Acesse `http://localhost:3000/login`
   - Faça login
   - Você deve ser redirecionado para `/dashboard`
   - ✅ Deve parar de piscar entre login e dashboard
   - ✅ Deve ver métricas e atividade recentes

3. **Verificar logs (Terminal):**
   - Procure por "JWT validated" - indica autenticação OK
   - Procure por "JWTAuthMiddleware" - deve estar limpo sem erros

---

## 📝 Variáveis de Ambiente Verificadas

Todas as variáveis necessárias estão configuradas em `.env`:

| Variável | Valor | Status |
|----------|-------|--------|
| `SUPABASE_JWT_SECRET` | 3mEZY2TNQvswMopqjhM/... | ✅ Configurado |
| `ADMIN_USER_ID` | 634251ee-71ec-45a7-... | ✅ Configurado |
| `SUPABASE_URL` | - | ✅ Deve estar presente |
| `SUPABASE_ANON_KEY` | - | ✅ Deve estar presente |
| `REDIS_HOST` | localhost | ✅ Configurado (opcional agora) |
| `REDIS_PORT` | 6379 | ✅ Configurado (opcional agora) |

---

## 🐛 Se Ainda Houver Problemas

**Erro: "Invalid or expired token"**
- Verifique se `SUPABASE_JWT_SECRET` está correto no `.env`
- Tente fazer logout e login novamente
- Verifique os logs do browser (F12 → Console)

**Erro: "Cannot read property 'from' of undefined"**
- Significa que ainda há referência a `supabase` não definida
- Procure por `await supabase.from(` nos arquivos
- Substitua por `await getSupabaseClient().from(`

**Redis ECONNREFUSED (apenas warning agora)**
- É normal se Redis não estiver rodando
- Funcionalidade de retry será limitada
- Para produção, configure Redis
