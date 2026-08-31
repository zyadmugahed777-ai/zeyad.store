/**
 * Zeyad For Business — PostgreSQL Shadow Database Setup
 * 
 * Creates the shadow database `zeyad_shadow` on PostgreSQL port 5433 (127.0.0.1)
 * with dedicated application user and UTF8 encoding.
 */

const { Client } = require('pg');

async function setupShadowDatabase() {
  const adminClient = new Client({
    host: process.env.PG_SHADOW_HOST || '127.0.0.1',
    port: parseInt(process.env.PG_SHADOW_PORT || '5433', 10),
    user: process.env.PG_SHADOW_USER || 'zfb_shadow_user',
    database: 'postgres'
  });

  try {
    await adminClient.connect();
    console.log('Connected to PostgreSQL server on port ' + (process.env.PG_SHADOW_PORT || '5433'));

    const res = await adminClient.query('SELECT version(), current_setting($1) as tz;', ['timezone']);
    console.log('PostgreSQL Version:', res.rows[0].version);
    console.log('PostgreSQL Timezone:', res.rows[0].tz);

    const dbName = process.env.PG_SHADOW_DATABASE || 'zeyad_shadow';
    const checkDb = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1;', [dbName]);

    if (checkDb.rows.length === 0) {
      await adminClient.query(`CREATE DATABASE "${dbName}" WITH OWNER "${process.env.PG_SHADOW_USER || 'zfb_shadow_user'}" ENCODING 'UTF8';`);
      console.log(`Database "${dbName}" created successfully.`);
    } else {
      console.log(`Database "${dbName}" already exists.`);
    }
  } finally {
    await adminClient.end();
  }
}

if (require.main === module) {
  setupShadowDatabase()
    .then(() => console.log('Shadow PostgreSQL DB Setup Complete.'))
    .catch(err => {
      console.error('Shadow DB Setup Error:', err);
      process.exit(1);
    });
}

module.exports = { setupShadowDatabase };
