import mysql from 'mysql2/promise';

export function createMySqlPool(databaseUrl) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  return mysql.createPool(databaseUrl);
}
