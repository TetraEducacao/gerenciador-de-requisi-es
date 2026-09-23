# Etapa 2 — Fluxo Funcional Mínimo: Plano de Implementação

**Objetivo:** Fazer a aplicação funcionar de ponta a ponta com integração Redis/BullMQ, CRUD de destinos, autenticação e processamento.

## Sequência de Implementação

### Fase 1: Infraestrutura Compartilhada
**Duração estimada:** 1-2 horas

1. **Criar utilitários compartilhados:**
   - `packages/shared/src/config.ts` - Configuração centralizada de Redis, Supabase
   - `packages/shared/src/errors.ts` - Classes de erro customizadas
   - `packages/shared/src/logger.ts` - Logger estruturado

2. **Criar tipos adicionais:**
   - `packages/shared/src/db.ts` - Tipos de banco de dados
   - Expandir `packages/shared/src/types.ts` com tipos de API

**Dependências a adicionar:**
- `winston` - Logging estruturado (opcional, mas recomendado)
- `pino` ou usar `console` estruturado

### Fase 2: API — Autenticação e CRUD de Destinos
**Duração estimada:** 2-3 horas

1. **Implementar autenticação por API Key:**
   - `apps/api/src/middleware/auth.ts` - Middleware de autenticação
   - `apps/api/src/services/auth.ts` - Serviço de geração e validação de hashes
   - Hash SHA256 das chaves (não armazenar em texto plano)

2. **Implementar CRUD de destinos:**
   - `apps/api/src/routes/destinations.ts` - Rotas CRUD
   - `apps/api/src/services/destinations.ts` - Lógica de negócio
   - Validação de URL (SSRF protection)
   - Validação de configurações

3. **Implementar CRUD de API Keys:**
   - `apps/api/src/routes/api-keys.ts` - Rotas CRUD
   - `apps/api/src/services/api-keys.ts` - Lógica de negócio

**Endpoints:**
```
GET    /admin/api-keys          - Listar chaves
POST   /admin/api-keys          - Criar chave
DELETE /admin/api-keys/:id      - Revogar chave

GET    /admin/destinations      - Listar destinos
POST   /admin/destinations      - Criar destino
GET    /admin/destinations/:id  - Obter destino
PUT    /admin/destinations/:id  - Atualizar destino
DELETE /admin/destinations/:id  - Deletar destino (soft delete)
```

### Fase 3: API — Recebimento e Enfileiramento
**Duração estimada:** 2-3 horas

1. **Implementar enfileiramento Redis/BullMQ:**
   - `apps/api/src/services/queue.ts` - Serviço de fila
   - Criar fila 'requests' no Redis
   - Gerenciador de conexão Redis

2. **Implementar POST /v1/requests:**
   - `apps/api/src/routes/requests.ts`
   - Validar autenticação
   - Validar destino
   - Persistir em Supabase
   - Enfileirar no BullMQ
   - Retornar 202 Accepted

3. **Implementar GET /v1/requests/:id:**
   - Consultar status no Supabase
   - Validar autorização

**Endpoints:**
```
POST   /v1/requests             - Enfileirar requisição (autenticado)
GET    /v1/requests/:id         - Consultar status (autenticado)
```

### Fase 4: Worker — Processamento de Filas
**Duração estimada:** 2-3 horas

1. **Implementar processador de requisições:**
   - `apps/worker/src/processors/request-processor.ts`
   - Conectar ao Redis
   - Consumir jobs da fila 'requests'
   - Encaminhar requisição ao destino (axios)

2. **Implementar persistência de resultados:**
   - `apps/worker/src/services/persistence.ts`
   - Atualizar status em Supabase
   - Registrar tentativas
   - Respeitar limites de cadência/concorrência (básico)

3. **Implementar tratamento de erros:**
   - Timeout
   - Retry automático
   - Dead-letter queue

### Fase 5: Testes e Validação
**Duração estimada:** 1-2 horas

1. **Teste de ponta a ponta:**
   - Criar destino via API
   - Gerar API Key
   - Enviar requisição
   - Verificar persistência
   - Verificar enfileiramento
   - Verificar processamento
   - Consultar status

2. **Validar:**
   - Type-check
   - Lint
   - Comportamento esperado

## Dependências Necessárias

### API
- `@supabase/supabase-js` ✓ (já tem)
- `bullmq` ✓ (já tem)
- `ioredis` ✓ (já tem)
- `axios` ✓ (já tem)
- `uuid` ✓ (já tem)
- `crypto` (built-in para SHA256)

### Worker
- `@supabase/supabase-js` ✓ (já tem)
- `bullmq` ✓ (já tem)
- `ioredis` ✓ (já tem)
- `axios` ✓ (já tem)
- `uuid` ✓ (já tem)

### Shared
- Tipos TypeScript ✓ (já tem)

**Adicionar:** nenhuma nova dependência obrigatória! Vamos usar o que já temos.

## Considerações de Segurança

1. **API Keys:**
   - Hash SHA256 (nunca armazenar texto plano)
   - Exibir chave completa apenas na criação
   - Identificar origem de cada requisição

2. **Destinos:**
   - Validar URLs (não permitir localhost, 127.0.0.1, redes privadas)
   - Não expor URLs de destino em erros públicos
   - Armazenar credenciais de forma segura (ou criptografar)

3. **Requisições:**
   - Não registrar corpos sensíveis
   - Sanitizar mensagens de erro
   - Proteger logs de exposição acidental

4. **Autenticação:**
   - Validar header `Authorization`
   - Rate limiting (implementar depois se necessário)
   - Revogar chaves expiradas

## Estrutura de Dados Chave

### api_keys (Supabase)
```
id: UUID
name: string
key_hash: string (SHA256)
source_id: UUID
created_at: timestamp
revoked_at: timestamp (NULL se ativo)
last_used_at: timestamp
```

### destinations (Supabase)
```
id: UUID
name: string
url: string
http_method: string
headers: JSONB (sem segredos em texto plano)
auth_config: JSONB (referência ou criptografado)
timeout_ms: int
rate_limit_value: int
rate_limit_unit: string
concurrency_limit: int
max_attempts: int
enabled: boolean
created_at: timestamp
updated_at: timestamp
```

### requests (Supabase)
```
id: UUID
source_id: UUID
destination_id: UUID
idempotency_key: string (UNIQUE, nullable)
payload: JSONB
content_type: string
status: 'queued' | 'processing' | 'succeeded' | 'retrying' | 'failed' | 'cancelled'
attempts: int
created_at: timestamp
started_at: timestamp
completed_at: timestamp
last_http_status: int
last_error: string (sanitizada)
```

### request_attempts (Supabase)
```
id: UUID
request_id: UUID
attempt_number: int
started_at: timestamp
completed_at: timestamp
http_status: int
duration_ms: int
error_message: string (sanitizada)
```

## Fila Redis/BullMQ

**Fila:** `requests`

**Job Shape:**
```typescript
{
  requestId: string (UUID)
  sourceId: string (UUID)
  destinationId: string (UUID)
  payload: any
  headers?: Record<string, string>
}
```

**Opções:**
```typescript
{
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  timeout: 30000,
  removeOnComplete: true,
  removeOnFail: false
}
```

## Fluxo de Ponta a Ponta

```
1. POST /v1/requests (autenticado)
   ↓
2. Validar API Key (middleware)
   ↓
3. Validar destino existe e ativo
   ↓
4. Criar registro em Supabase (status: 'queued')
   ↓
5. Enfileirar job no BullMQ
   ↓
6. Retornar 202 Accepted com request_id
   ↓
7. Worker consume o job
   ↓
8. Atualizar status para 'processing'
   ↓
9. Fazer requisição HTTP ao destino
   ↓
10. Registrar resultado (http_status, duração)
    ↓
11. Atualizar status (succeeded/failed/retrying)
    ↓
12. GET /v1/requests/:id retorna status atual
```

## Critérios de Sucesso (Etapa 2)

- ✅ Autenticação por API Key funcionando
- ✅ CRUD de destinos completo
- ✅ POST /v1/requests enfileirando corretamente
- ✅ Worker processando jobs
- ✅ Resultados persistidos no Supabase
- ✅ GET /v1/requests/:id retornando status
- ✅ Type-check: 0 erros
- ✅ Teste E2E completado manualmente
- ✅ Sem exposição de segredos em logs/respostas

## Próximos Passos Após Etapa 2

- Etapa 3: Controle (limites de taxa, concorrência, retry avançado)
- Etapa 4: Painel (dashboard, CRUD UI)
- Etapa 5: Segurança (testes, revisão de SSRF)
- Etapa 6: Deploy (EasyPanel)
