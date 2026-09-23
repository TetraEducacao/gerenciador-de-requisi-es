# Request Manager — Especificação de Desenvolvimento

## 1. Objetivo do projeto

Construir uma aplicação web para receber requisições HTTP de diferentes sistemas e encaminhá-las para destinos configuráveis, controlando a cadência e a concorrência dos envios.

A aplicação deve funcionar como uma camada intermediária assíncrona:

1. Um sistema de origem envia uma requisição para o Request Manager.
2. A API valida e registra a requisição.
3. A requisição é colocada em uma fila.
4. O worker processa a fila respeitando as configurações.
5. A requisição é encaminhada ao destino definido.
6. O resultado é registrado para consulta no painel.

**Requisito central:** não restringir o sistema a integrações específicas. As origens e os destinos devem ser configuráveis, sem depender de CRM, provedor ou API previamente definido.

## 2. Stack obrigatória

- **Frontend:** Next.js
- **Backend/API de entrada:** Node.js + Fastify
- **Fila e processamento:** BullMQ
- **Armazenamento/coordenação da fila:** Redis
- **Banco persistente:** Supabase PostgreSQL
- **Hospedagem e implantação:** EasyPanel
- **Versionamento:** GitHub
- **Linguagem recomendada:** TypeScript

Não introduzir Kubernetes, microsserviços adicionais ou plataformas de observabilidade complexas no MVP.

## 3. Arquitetura de implantação

O projeto deve ficar em um único repositório GitHub (monorepo), com serviços executados separadamente no EasyPanel:

- `request-manager-web`: aplicação Next.js.
- `request-manager-api`: API Fastify que recebe requisições.
- `request-manager-worker`: processo BullMQ que consome filas e faz os envios.
- `request-manager-redis`: serviço Redis privado.

O Supabase será utilizado como serviço externo para persistência. Não instalar PostgreSQL na VPS para este projeto.

A API, o worker e o Redis devem comunicar-se pela rede interna do EasyPanel sempre que possível. Não expor o Redis à internet pública.

## 4. Estrutura sugerida do repositório

```text
request-manager/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   ├── public/
│   │   ├── package.json
│   │   └── Dockerfile
│   ├── api/
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── middleware/
│   │   │   ├── services/
│   │   │   └── server.ts
│   │   ├── package.json
│   │   └── Dockerfile
│   └── worker/
│       ├── src/
│       │   ├── processors/
│       │   ├── queues/
│       │   └── worker.ts
│       ├── package.json
│       └── Dockerfile
├── packages/
│   └── shared/
│       └── src/
├── supabase/
│   └── migrations/
├── package.json
├── package-lock.json
├── docker-compose.yml
├── .gitignore
└── README.md
```

A estrutura pode ser refinada, mas deve preservar a separação entre interface, API e processamento.

## 5. Requisitos funcionais do MVP

### 5.1 Autenticação e segurança de entrada

- Criar autenticação de API por chave/token.
- Permitir criar, revogar e identificar chaves pelo painel.
- Armazenar apenas hash das chaves sempre que viável; exibir o segredo completo somente na criação.
- Associar cada chave a uma origem ou conjunto de permissões.
- Validar tamanho máximo do corpo, método HTTP e formato dos dados.
- Não registrar segredos, cabeçalhos de autenticação ou dados sensíveis nos logs.
- Aplicar limites básicos de tamanho e frequência na API de entrada.
- Proteger rotas administrativas com autenticação.

### 5.2 Recebimento genérico

A API deve aceitar requisições HTTP de sistemas autorizados. Não codificar integrações exclusivas para uma ferramenta específica.

O recebimento deve permitir, conforme configuração:

- Método HTTP de entrada.
- Identificador da origem.
- Identificador do destino ou regra de roteamento.
- Corpo da requisição, preservando JSON e outros tipos de conteúdo suportados.
- Cabeçalhos permitidos e parâmetros necessários ao encaminhamento.
- Chave de idempotência opcional.

A API deve colocar o trabalho na fila e responder rapidamente, sem aguardar o destino concluir o processamento.

Resposta de referência após aceitação durável:

```json
{
  "request_id": "identificador-unico",
  "status": "queued"
}
```

Usar HTTP `202 Accepted` para indicar que o trabalho foi aceito para processamento assíncrono. Não confirmar aceitação antes de o job ter sido persistido de acordo com a garantia de durabilidade implementada.

### 5.3 Destinos e roteamento

No painel, o usuário deve poder cadastrar, editar, ativar, pausar e excluir logicamente destinos.

Cada destino deve permitir configurar:

- Nome e descrição.
- URL de destino.
- Método HTTP padrão.
- Cabeçalhos adicionais necessários.
- Tipo de conteúdo.
- Credenciais ou tokens de autenticação, armazenados de forma segura.
- Timeout.
- Limites de cadência e concorrência.
- Número máximo de tentativas.
- Estado ativo/pausado.

A origem deve conseguir indicar o destino por um identificador estável, ou usar uma regra de roteamento configurada. Não permitir que qualquer remetente sem autorização encaminhe livremente para URLs arbitrárias.

**Proteção contra SSRF:** validar destinos e impedir acesso a endereços locais, loopback, redes privadas, endpoints de metadados de nuvem e outros alvos proibidos. Revalidar redirecionamentos e DNS conforme necessário. Não confiar apenas na validação feita no frontend.

### 5.4 Filas e processamento

- Usar BullMQ com Redis.
- Separar filas por destino ou por grupos de destinos quando isso ajudar a isolar carga.
- Garantir que um destino lento não paralise desnecessariamente todos os outros.
- Permitir pausar e retomar o processamento de um destino.
- Implementar tratamento de falhas e fila de falhas (dead-letter) após esgotar tentativas.
- Manter o processamento independente do ciclo de vida da API.
- Configurar persistência e recuperação do Redis adequadas à fila; documentar os limites da garantia de entrega.
- Não afirmar entrega “exatamente uma vez”. Projetar para entrega pelo menos uma vez quando aplicável e tratar duplicidade por idempotência.

### 5.5 Cadência e concorrência

Configurações por destino:

- Limite máximo de requisições por segundo ou por minuto.
- Concorrência máxima de requisições em andamento.
- Intervalo mínimo entre envios, se necessário.
- Número máximo de tentativas.
- Estratégia de espera entre tentativas.
- Timeout por requisição.

A cadência e a concorrência são controles distintos e devem ser implementados separadamente. Para limites estritos, o controle deve ser coordenado entre todas as instâncias de worker, não apenas em memória de um processo.

Tratar respostas HTTP `429` respeitando `Retry-After` quando disponível. Usar backoff exponencial com jitter para erros temporários. Não repetir automaticamente erros permanentes sem uma regra explícita.

### 5.6 Histórico e estados

Registrar no Supabase os dados necessários para auditoria e consulta:

- ID da requisição.
- Origem e destino.
- Data/hora de recebimento.
- Estado atual.
- Datas de início e conclusão.
- Quantidade de tentativas.
- Código HTTP de resposta, quando houver.
- Duração do processamento.
- Mensagem de erro sanitizada.
- Chave de idempotência, se fornecida.

Estados sugeridos:

- `queued`
- `processing`
- `succeeded`
- `retrying`
- `failed`
- `cancelled`

Não guardar corpos sensíveis indefinidamente. Definir política de retenção configurável e evitar persistir dados que não sejam necessários.

### 5.7 Painel web

Criar uma interface administrativa clara e responsiva, com:

1. **Dashboard**
   - Total recebido, pendente, processando, concluído e com falha.
   - Métricas por período e por destino.
   - Indicadores de fila e saúde dos serviços, quando disponíveis.

2. **Destinos**
   - Listar e pesquisar destinos.
   - Criar e editar configurações.
   - Ativar, pausar e testar conexão.
   - Visualizar limites de cadência e concorrência.

3. **Requisições**
   - Listar e filtrar por estado, origem, destino e período.
   - Ver detalhes e histórico de tentativas.
   - Reprocessar uma requisição com confirmação e controle de duplicidade.
   - Não exibir segredos nos detalhes.

4. **Chaves de API**
   - Criar e revogar chaves.
   - Identificar a origem associada.
   - Mostrar a chave completa somente uma vez, no momento da criação.

5. **Configurações**
   - Ajustes gerais e política de retenção, conforme implementados.

## 6. Modelo de dados inicial no Supabase

Criar migrations SQL versionadas no repositório. O modelo pode ser ajustado conforme o desenvolvimento, mas deve contemplar pelo menos:

### `api_keys`
- `id`
- `name`
- `key_hash`
- `source_id`
- `created_at`
- `revoked_at`
- `last_used_at`

### `sources`
- `id`
- `name`
- `description`
- `created_at`
- `updated_at`

### `destinations`
- `id`
- `name`
- `description`
- `url`
- `http_method`
- `headers` (JSONB, sem segredos em texto aberto quando houver alternativa segura)
- `auth_config` (armazenamento protegido ou referência a segredo)
- `timeout_ms`
- `rate_limit_value`
- `rate_limit_unit`
- `concurrency_limit`
- `min_interval_ms`
- `max_attempts`
- `enabled`
- `created_at`
- `updated_at`

### `requests`
- `id`
- `source_id`
- `destination_id`
- `idempotency_key`
- `payload` (JSONB ou formato apropriado ao conteúdo suportado)
- `content_type`
- `status`
- `attempts`
- `created_at`
- `scheduled_at`
- `started_at`
- `completed_at`
- `last_http_status`
- `last_error`

### `request_attempts`
- `id`
- `request_id`
- `attempt_number`
- `started_at`
- `completed_at`
- `http_status`
- `duration_ms`
- `error_message` (sanitizada)

### `audit_logs`
- `id`
- `actor`
- `action`
- `resource_type`
- `resource_id`
- `metadata` (sem segredos)
- `created_at`

Criar índices adequados para consultas frequentes, especialmente por estado, destino, origem e data. Definir políticas RLS e acesso do servidor com privilégios mínimos. Nunca expor a chave `service_role` no frontend.

**Nota de consistência:** o banco e a fila Redis são sistemas separados. Projetar cuidadosamente a sequência de persistência e enfileiramento para reduzir o risco de registros presos ou jobs perdidos. Documentar a estratégia adotada; considerar padrão outbox se necessário para a garantia desejada, sem adicionar complexidade prematuramente.

## 7. API inicial proposta

Os caminhos podem ser refinados, mas devem manter comportamento consistente e documentação:

### Entrada pública autenticada
- `POST /v1/requests` — recebe uma requisição para enfileiramento.
- `GET /v1/requests/:id` — consulta o estado, apenas para clientes autorizados.

### Administração
- CRUD de destinos.
- CRUD/revogação de chaves.
- Listagem e consulta de requisições.
- Pausar/retomar destino.
- Reprocessar requisição.

Documentar endpoints, autenticação, payloads, códigos de resposta e exemplos no README ou em documentação OpenAPI.

## 8. Variáveis de ambiente

Criar `.env.example` com nomes e descrições, sem valores reais. No mínimo:

```env
NODE_ENV=
WEB_PORT=
API_PORT=
API_BASE_URL=
NEXT_PUBLIC_API_BASE_URL=

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

REDIS_HOST=
REDIS_PORT=
REDIS_USERNAME=
REDIS_PASSWORD=
REDIS_TLS=

INTERNAL_API_SECRET=
```

Adicionar outras variáveis somente quando necessárias. Garantir que segredos sejam configurados no EasyPanel e nunca commitados no GitHub.

## 9. Docker e EasyPanel

- Criar Dockerfile adequado para cada serviço executável.
- Usar imagens enxutas e builds reproduzíveis.
- Configurar health checks para API e worker quando possível.
- Garantir encerramento gracioso dos workers, permitindo que jobs em andamento sejam tratados com segurança.
- Documentar como criar os quatro serviços no EasyPanel, conectar o repositório GitHub, definir comandos/builds, variáveis e rede interna.
- Documentar configuração de domínio e HTTPS para o painel e, se necessário, para a API.
- Redis deve permanecer privado.
- Não assumir nomes de domínio ou credenciais; usar placeholders na documentação.
- Incluir `docker-compose.yml` para desenvolvimento local, sem substituir as instruções de implantação no EasyPanel.

## 10. GitHub e qualidade do projeto

- Configurar Git e `.gitignore`.
- Não versionar `.env`, credenciais, dumps de produção ou dados pessoais.
- Incluir README com instalação, desenvolvimento, testes, migrations, execução local e deploy.
- Incluir lint, formatação e verificação de tipos.
- Criar testes para autenticação, validação, enfileiramento, cadência, retentativas e roteamento.
- Usar commits claros e não incluir segredos em histórico.
- Não fazer push ou publicar segredos automaticamente.

## 11. Requisitos não funcionais

- Recebimento rápido e processamento assíncrono.
- Isolamento de falhas por destino sempre que possível.
- Controle de consumo de memória e tamanho máximo do payload.
- Logs estruturados com IDs de correlação.
- Métricas básicas de volume, fila, latência e falhas.
- Segurança por padrão: autenticação, autorização, validação de destinos, proteção contra SSRF, segredos protegidos e acesso mínimo.
- Comportamento explícito em caso de indisponibilidade do Supabase ou Redis.
- Nenhuma promessa de capacidade sem teste de carga.

## 12. Plano de desenvolvimento

Implementar em etapas pequenas e verificáveis. Não tentar construir tudo de uma vez.

### Etapa 1 — Fundação
- Criar monorepo TypeScript.
- Configurar Next.js, Fastify, BullMQ e conexão Redis.
- Configurar cliente Supabase e migrations iniciais.
- Criar Dockerfiles, Compose local e `.env.example`.
- Confirmar que todos os serviços iniciam.

### Etapa 2 — Fluxo funcional mínimo
- Criar um destino.
- Receber requisição autenticada.
- Persistir o registro e enfileirar.
- Worker encaminha a requisição.
- Registrar resultado e permitir consulta do estado.

### Etapa 3 — Controle
- Implementar limites de taxa e concorrência.
- Implementar timeout, retentativas, backoff e tratamento de `429`.
- Isolar processamento por destino.
- Implementar idempotência e fila de falhas.

### Etapa 4 — Painel
- Dashboard básico.
- CRUD de destinos e chaves.
- Lista de requisições e detalhes.
- Pausar/retomar e reprocessar com segurança.

### Etapa 5 — Segurança e testes
- Revisar autenticação, autorização, RLS e gestão de segredos.
- Testar proteção SSRF e validação de redirecionamentos.
- Testes unitários e de integração.
- Teste de carga gradual e documentação dos resultados.

### Etapa 6 — Implantação
- Subir o código ao GitHub.
- Configurar serviços no EasyPanel.
- Configurar variáveis, rede interna, domínio e HTTPS.
- Verificar health checks, logs, reinício e recuperação.
- Executar teste de ponta a ponta em ambiente controlado.

## 13. Critérios de aceite do MVP

O MVP será considerado funcional quando:

1. Um cliente autenticado conseguir enviar uma requisição genérica.
2. A API retornar confirmação de enfileiramento sem esperar pelo destino.
3. O worker encaminhar a requisição ao destino configurado.
4. O sistema respeitar limite de taxa e concorrência configurados.
5. Falhas temporárias forem tratadas conforme a política de retentativas.
6. O resultado e as tentativas puderem ser consultados no painel.
7. Um destino puder ser pausado sem interromper indevidamente os demais.
8. Chaves e credenciais não forem expostas em respostas, logs ou frontend.
9. O projeto puder ser executado localmente e implantado no EasyPanel seguindo o README.
10. As limitações de durabilidade, duplicidade e entrega estiverem documentadas.

## 14. Instruções para o Claude

Trabalhe como engenheiro de software responsável pela implementação.

- Primeiro, inspecione o repositório e informe o que já existe antes de sobrescrever arquivos.
- Se o repositório estiver vazio, inicialize a estrutura proposta.
- Implemente uma etapa por vez, mantendo a aplicação executável.
- Antes de avançar, rode os testes e verificações disponíveis e corrija os erros.
- Não invente credenciais, domínios, chaves ou dados de produção.
- Não coloque segredos em código, documentação de exemplo ou commits.
- Não adicione tecnologias fora da stack definida sem justificar e pedir aprovação.
- Prefira soluções simples, legíveis e seguras.
- Ao concluir cada etapa, apresente: arquivos criados/alterados, decisões relevantes, comandos de teste executados, resultado dos testes e próximos passos.
- Se faltar uma informação que bloqueie uma decisão importante, faça uma pergunta objetiva. Para detalhes não bloqueadores, escolha uma opção simples e documente a decisão.
- Não declare que a aplicação está pronta para produção sem testes de carga, revisão de segurança e verificação da implantação.

**Comece pela Etapa 1 — Fundação.**
