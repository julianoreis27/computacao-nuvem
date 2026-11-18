# Estoque do Supermercado

Aplicação web CRUD para gestão de estoque de um supermercado.
O back-end é **Node.js + Express** e grava em **Amazon DynamoDB** ou **Amazon RDS (PostgreSQL)**; você escolhe o banco por variável de ambiente. O front-end é HTML/CSS/JS puro, servido pela própria aplicação.

![Tela principal](docs/tela-principal.png)

## Funcionalidades

- **Cadastrar, listar, consultar, editar e excluir** produtos (nome, categoria, código de barras, quantidade, unidade, estoque mínimo, preço, validade, fornecedor)
- **Entrada e saída de estoque**: operação atômica no banco que impede estoque negativo
- **Painel de resumo**: total de produtos, itens, valor em estoque, itens abaixo do mínimo e vencendo em até 7 dias
- **Busca** (ignora acentos) e **filtros** por categoria e situação (estoque baixo / vencendo)
- Validação no servidor com mensagens por campo exibidas no formulário

## Estrutura

```
src/
  server.js                     # inicialização
  app.js                        # rotas da API REST + arquivos estáticos
  validation.js                 # validação/normalização dos dados
  repositories/
    index.js                    # escolhe o banco (DB_CLIENT)
    dynamoRepository.js         # implementação DynamoDB
    postgresRepository.js       # implementação RDS PostgreSQL
public/                         # front-end (index.html, styles.css, app.js)
scripts/seed.js                 # dados de exemplo
scripts/criar-tabela-dynamodb.js
test/api.test.js                # testes de integração (DynamoDB e PostgreSQL)
docker-compose.yml              # DynamoDB Local e PostgreSQL para desenvolvimento
infra/cloudformation.yaml       # infraestrutura AWS com HA Multi-AZ (ALB + Auto Scaling)
docs/arquitetura.drawio         # diagrama de arquitetura (draw.io)
```

## API REST

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/produtos?busca=&categoria=&status=baixo\|vencendo` | Lista produtos (com filtros) |
| GET | `/api/produtos/:id` | Consulta um produto |
| POST | `/api/produtos` | Cria um produto |
| PUT | `/api/produtos/:id` | Atualiza um produto |
| DELETE | `/api/produtos/:id` | Exclui um produto |
| POST | `/api/produtos/:id/movimentacoes` | `{ "tipo": "entrada"\|"saida", "quantidade": 5 }` |
| GET | `/api/health` | Status e banco em uso |

Exemplo de corpo para criar/atualizar:

```json
{
  "nome": "Arroz Branco Tipo 1 5kg",
  "categoria": "Mercearia",
  "codigoBarras": "7896006716112",
  "quantidade": 48,
  "unidade": "pct",
  "estoqueMinimo": 15,
  "precoUnitario": 27.9,
  "validade": "2027-07-16",
  "fornecedor": "Distribuidora Grão Bom"
}
```

## Executando localmente

Pré-requisitos: Node.js 18+ e Docker (para os bancos locais).

```bash
npm install
```

```bash
cp .env.example .env
```

### Com DynamoDB (padrão)

```bash
docker compose up -d dynamodb
```

```bash
npm run seed
```

```bash
npm start
```

Acesse http://localhost:3000.

### Com RDS / PostgreSQL

No `.env`, troque `DB_CLIENT=postgres` e descomente `DATABASE_URL`:

```bash
docker compose up -d postgres
```

```bash
npm run seed && npm start
```

A tabela `produtos` é criada automaticamente na inicialização.

## Testes

Os testes de integração exercitam todo o CRUD pela API HTTP. O DynamoDB é emulado em memória (`dynalite`), então não precisa de Docker:

```bash
npm test
```

Para testar também contra PostgreSQL:

```bash
TEST_DATABASE_URL=postgres://estoque:estoque@localhost:5432/estoque npm test
```

## Arquitetura na AWS (alta disponibilidade Multi-AZ)

O diagrama está em [`docs/arquitetura.drawio`](docs/arquitetura.drawio). Abra em https://app.diagrams.net (*Arquivo → Abrir de → Dispositivo*) ou no draw.io Desktop. Ele tem duas páginas:

1. **Arquitetura AWS (HA Multi-AZ)**: VPC, sub-redes, Load Balancer, Auto Scaling, bancos e security groups.
2. **Estrutura da aplicação**: front-end, rotas da API, validação, repositórios e modelo de dados.

Resumo da arquitetura:

| Camada | Recursos | Como garante disponibilidade |
|---|---|---|
| Entrada | Internet Gateway → **Application Load Balancer** nas 2 sub-redes públicas | O ALB tem nós em 2 AZs e verifica `/api/health` a cada 15 s |
| Web/aplicação | **Auto Scaling Group** de EC2 (Node.js) em 2 sub-redes privadas, mín. 2 / máx. 4 | Uma instância por AZ; instâncias com falha são substituídas e o ASG escala por CPU (alvo 60%) |
| Dados | **DynamoDB** (padrão, via VPC Gateway Endpoint) ou **RDS PostgreSQL Multi-AZ** | DynamoDB replica em 3 AZs; o RDS mantém uma standby síncrona com failover automático |
| Saída | Um **NAT Gateway por AZ** | A falha de uma AZ não afeta a saída da outra |
| Segurança | `sg-alb` (80 da internet) → `sg-app` (3000 só do ALB) → `sg-db` (5432 só da aplicação) | EC2 e RDS sem IP público; acesso administrativo pelo SSM Session Manager |

## Implantação na AWS (CloudFormation)

O template [`infra/cloudformation.yaml`](infra/cloudformation.yaml) cria toda a arquitetura do diagrama. Cada instância, ao iniciar, instala o Node.js, clona este repositório, gera o `.env` e sobe a aplicação como serviço `systemd`.

**Pelo console:** CloudFormation → *Criar pilha* → *Fazer upload de um arquivo de modelo* → selecione `infra/cloudformation.yaml` → preencha os parâmetros → *Criar*. Ao final (cerca de 5 a 10 minutos com DynamoDB; mais se usar RDS), abra a saída **AppUrl**.

**Pela CLI (DynamoDB):**

```bash
aws cloudformation deploy --template-file infra/cloudformation.yaml --stack-name estoque --capabilities CAPABILITY_IAM
```

**Com RDS PostgreSQL Multi-AZ:**

```bash
aws cloudformation deploy --template-file infra/cloudformation.yaml --stack-name estoque --capabilities CAPABILITY_IAM --parameter-overrides DbClient=postgres DbPassword=TroqueEstaSenha123
```

**AWS Academy (Learner Lab):** o laboratório não permite criar IAM Roles. Informe o perfil já existente:

```bash
aws cloudformation deploy --template-file infra/cloudformation.yaml --stack-name estoque --parameter-overrides InstanceProfileName=LabInstanceProfile
```

Principais parâmetros: `RepoUrl` (repositório **público** com o código), `InstanceType`, `MinSize`/`DesiredCapacity`/`MaxSize`, `DbClient` (`dynamodb` ou `postgres`), `DbPassword`, `DbMultiAZ`.

**Testando o failover da camada web:** no console do EC2, encerre uma das duas instâncias. A aplicação continua respondendo pelo endereço do ALB, servida pela instância da outra AZ, e o Auto Scaling cria uma substituta em poucos minutos.

**Custos:** NAT Gateways, ALB e RDS Multi-AZ são cobrados por hora. Exclua a pilha ao terminar:

```bash
aws cloudformation delete-stack --stack-name estoque
```
