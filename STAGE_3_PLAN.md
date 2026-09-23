# Etapa 3 — Controle de Cadência e Concorrência: Plano de Implementação

**Objetivo:** Implementar controles de rate limiting, concorrência e backoff para garantir que requisições sejam processadas de acordo com as limitações configuradas por destino.

## Estratégia de Implementação

### 1. Rate Limiting por Destino

**Problema:** Atualmente não há controle de cadência (requisições por segundo/minuto).

**Solução:**
- Usar Redis como armazenamento de estado para rate limits
- Chave Redis: `rate_limit:{destination_id}` → timestamp do último envio
- Chave Redis: `rate_limit_counter:{destination_id}:{minute}` → contador de requisições
- Implementar token bucket algorithm ou sliding window

**Implementação:**
- `packages/shared/src/rate-limiter.ts` - Classe RateLimiter
- Usar Redis `SET` com `NX` e `EX` para operações atômicas
- Consultar `destination.rate_limit_value` e `destination.rate_limit_unit` antes de processar

**Exemplo de Configuração:**
```
Destino A: 10 requisições/segundo
Destino B: 100 requisições/minuto
Destino C: 1000 requisições/hora
```

### 2. Controle de Concorrência

**Problema:** Todos os jobs são processados simultaneamente sem limite por destino.

**Solução:**
- Usar BullMQ `concurrency` option por fila/processador
- Criar fila separada por destino OU usar Redis semaphore
- Rastrear jobs "in-progress" por destino
- Rejeitar novo job se atingir limite

**Abordagem Escolhida: Job Processor com Redis Semaphore**
- Mais simples que filas por destino
- Melhor para numero dinâmico de destinos
- Chave Redis: `concurrency:{destination_id}` → contador de jobs em progresso
- Incrementar ao iniciar, decrementar ao terminar
- Se contador >= `destination.concurrency_limit`, aguardar

**Exemplo:**
```
Destino A: max 2 requisições simultâneas
Destino B: max 5 requisições simultâneas
Destino C: max 1 requisição simultânea
```

### 3. Intervalo Mínimo Entre Requisições

**Problema:** Sem intervalo obrigatório entre envios para o mesmo destino.

**Solução:**
- Armazenar timestamp do último envio bem-sucedido
- Calcular tempo de espera necessário
- Se intervalo mínimo não foi atingido, retentar com delay
- Usar BullMQ `delay` option para retentar

**Implementação:**
- `rate-limiter.ts` - Método `waitUntilNextAllowed()`
- Redis key: `last_sent:{destination_id}` → timestamp
- Delay = `max(0, destination.min_interval_ms - (now - last_sent))`

**Exemplo:**
```
Destino A: 200ms entre requisições
Destino B: 1 segundo entre requisições
Destino C: 5 segundos entre requisições
```

### 4. Backoff Exponencial com Jitter

**Problema:** Retry atual usa backoff fixo sem jitter.

**Solução:**
- Implementar backoff exponencial: `delay = base * (factor ^ attempt)`
- Adicionar jitter aleatório: `delay * random(0.5, 1.5)`
- Respeitar header `Retry-After` se presente
- Limitar máximo de tentativas por configuração

**Fórmula:**
```
delay = min(
  base_delay * (2 ^ (attempt - 1)),
  max_delay
) * random(0.5, 1.5)
```

**Exemplo com base_delay=2s, max_delay=60s:**
```
Tentativa 1: Falha → Retry em ~2s
Tentativa 2: Falha → Retry em ~4s
Tentativa 3: Falha → Retry em ~8s
Tentativa 4: Falha → Retry em ~16s
Tentativa 5: Falha → Retry em ~32s
Tentativa 6: Falha → Retry em ~60s (max)
```

### 5. Recuperação de Requisições Não Enfileiradas

**Problema:** Se enfileiramento falhar, request fica com status "failed" e não é recuperado.

**Solução: Reconciliação Simples**
- Cron job / Recorrente que verifica requisições não processadas
- Consulta Supabase: `status IN ('queued', 'processing')` e `created_at < NOW() - 5min`
- Tenta reenfileirar essas requisições
- Limita tentativas para não ficar em loop infinito

**Alternativa: Outbox Pattern** (mais complexo, avaliar se necessário)
- Tabela `request_outbox` com jobs pendentes de envio
- Worker consome dessa tabela
- Apenas deleta após sucesso confirmado

**Para MVP: Reconciliação é suficiente**
- Simples de implementar
- Sem adicionar tabelas
- Registra tentativas no `audit_logs`

### 6. Atualização de Configurações

**Problema:** Alterações de `rate_limit_value`, `concurrency_limit`, etc. não são aplicadas até restart.

**Solução:**
- Consultar banco de dados a cada job (não cachear)
- Configurações são aplicadas imediatamente
- Nenhuma recompilação necessária

**Implementação:**
- No processador, sempre fazer SELECT do destino antes de aplicar limites
- Usar Redis com TTL curto para cache opcional (5-10 segundos)

### 7. Estrutura de Dados no Redis

```
rate_limit:{destination_id}              → timestamp do último envio
concurrency:{destination_id}             → counter de jobs em progresso
rate_limit_window:{destination_id}:{ms}  → counter de requisições na janela

retry_backoff:{request_id}:{attempt}     → delay calculado
last_sent:{destination_id}               → último timestamp de sucesso
```

## Arquivos a Criar/Modificar

### Novos Arquivos

**Shared Package:**
- `packages/shared/src/rate-limiter.ts` - RateLimiter class
- `packages/shared/src/backoff.ts` - Backoff strategies
- `packages/shared/src/concurrency.ts` - Concurrency manager

**Worker:**
- `apps/worker/src/services/rate-limiting.ts` - Rate limit service
- `apps/worker/src/services/reconciliation.ts` - Recovery service
- `apps/worker/src/scheduled/reconciliation-job.ts` - Scheduler para reconciliação

**Tests:**
- `apps/worker/tests/rate-limiting.test.ts`
- `apps/worker/tests/concurrency.test.ts`
- `apps/worker/tests/backoff.test.ts`

### Arquivos a Modificar

**Worker:**
- `apps/worker/src/processors/request-processor.ts` - Integrar rate limiting e backoff
- `apps/worker/src/worker.ts` - Adicionar reconciliation scheduler

**API:**
- `apps/api/src/services/requests.ts` - Documentar comportamento

## Ordem de Implementação

### Fase 1: Rate Limiting Básico
1. Criar `rate-limiter.ts` com operações Redis
2. Implementar token bucket algorithm
3. Integrar no processador

### Fase 2: Concorrência
1. Criar `concurrency.ts` com semaphore via Redis
2. Integrar no processador (antes de enviar HTTP)

### Fase 3: Intervalo Mínimo
1. Adicionar lógica de `min_interval_ms` no rate limiter
2. Retornar delay necessário

### Fase 4: Backoff Exponencial
1. Criar `backoff.ts` com cálculos
2. Integrar com retry do BullMQ
3. Respeitar Retry-After header

### Fase 5: Recuperação
1. Criar `reconciliation.ts`
2. Scheduler que roda a cada N minutos
3. Testar recuperação de requisições perdidas

### Fase 6: Testes
1. Criar testes unitários para cada componente
2. Testes de integração com Redis mock
3. Validar comportamento com múltiplos workers

## Considerações de Implementação

### Redis Atomicidade
- Usar `INCR`, `SET NX EX`, `GETSET` para operações atômicas
- Garantir que múltiplos workers não criem race conditions

### TTL no Redis
- Rate limit counters: TTL = `rate_limit_unit` (1s, 60s, 3600s)
- Concurrency counters: TTL = alta (1 hora) para recovery
- Last sent: TTL = alta para tracking

### Teste Local
- Mock Redis via docker-compose (já temos)
- Jest para testes unitários
- Integration tests com Redis real

### Documentação
- Comentar lógica complexa de rate limiting
- Diagrama de fluxo no README
- Exemplos de configuração

## Critérios de Sucesso (Etapa 3)

✅ Rate limiting por segundo/minuto funcionando  
✅ Concorrência máxima respeitada  
✅ Intervalo mínimo entre requisições  
✅ Backoff exponencial com jitter  
✅ Recuperação de requisições perdidas  
✅ Configurações aplicáveis sem restart  
✅ Type-check: 0 erros  
✅ Testes passando  
✅ Sem duplicação de jobs  
✅ Comportamento correto com múltiplos workers  

## Próximos Passos Após Etapa 3

- Etapa 4: Painel (UI para gerenciar destinos/requisições)
- Etapa 5: Testes e segurança (revisão OWASP)
- Etapa 6: Deploy (EasyPanel, domínio, HTTPS)
