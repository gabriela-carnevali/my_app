import pg from 'pg';

const { Pool } = pg;

const enderecoDeConexao = process.env.DATABASE_URL;

if (!enderecoDeConexao) {
  throw new Error('Configure DATABASE_URL antes de iniciar o backend.');
}

export const bancoDeDados = new Pool({
  connectionString: enderecoDeConexao,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

bancoDeDados.on('error', (erro) => {
  console.error('Unexpected PostgreSQL pool error:', erro.message);
});

export default bancoDeDados;
