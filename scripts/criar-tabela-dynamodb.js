// Cria a tabela do DynamoDB (se ainda não existir) usando as variáveis do .env.
// Uso: npm run criar-tabela
require('dotenv').config();
const { DynamoRepository } = require('../src/repositories/dynamoRepository');

(async () => {
  const repo = new DynamoRepository({
    tableName: process.env.DYNAMODB_TABLE,
    region: process.env.AWS_REGION,
    endpoint: process.env.DYNAMODB_ENDPOINT,
  });
  await repo.init({ criarTabela: true });
  console.log(`Tabela "${repo.tableName}" pronta.`);
  await repo.fechar();
})().catch((err) => {
  console.error('Falha ao criar a tabela:', err.message);
  process.exit(1);
});
