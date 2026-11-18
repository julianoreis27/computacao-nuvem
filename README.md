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

## Implantação na AWS

### Opção A: DynamoDB

1. Crie a tabela (ou deixe `AUTO_CREATE_TABLE=true`):
   ```bash
   aws dynamodb create-table --table-name Produtos \
     --attribute-definitions AttributeName=id,AttributeType=S \
     --key-schema AttributeName=id,KeyType=HASH \
     --billing-mode PAY_PER_REQUEST
   ```
2. Dê à instância/serviço uma **IAM Role** com permissão `dynamodb:GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Scan` e `DescribeTable` na tabela (e `CreateTable` se usar a criação automática).
3. Variáveis de ambiente: `DB_CLIENT=dynamodb`, `AWS_REGION`, `DYNAMODB_TABLE=Produtos`. **Não** defina `DYNAMODB_ENDPOINT` nem chaves de acesso; a role fornece as credenciais.

### Opção B: RDS PostgreSQL

1. Crie uma instância RDS PostgreSQL (versão 13 ou superior) e um banco `estoque`.
2. Libere a porta 5432 no *security group* do RDS **apenas** para o security group da aplicação.
3. Variáveis de ambiente: `DB_CLIENT=postgres`, `DATABASE_URL=postgres://USUARIO:SENHA@ENDPOINT:5432/estoque`, `DATABASE_SSL=true`.

### Onde rodar a aplicação

Qualquer serviço que execute Node.js serve, por exemplo:

- **Elastic Beanstalk** (plataforma Node.js): compacte o projeto sem `node_modules` e envie; o comando `npm start` já está configurado.
- **EC2**: `git clone`, `npm install --omit=dev`, configure o `.env` e rode com `pm2` ou `systemd` atrás de um Nginx.
- **App Runner / ECS**: use a imagem oficial `node:22-alpine` e execute `npm start`.

Lembre-se de expor a porta definida em `PORT` (padrão 3000).
