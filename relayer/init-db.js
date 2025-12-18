const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

async function initDatabase() {
    console.log('======================================');
    console.log('Initializing Neon Database');
    console.log('======================================');
    console.log('');

    if (!process.env.DATABASE_URL) {
        console.error('❌ Error: DATABASE_URL not found in .env');
        process.exit(1);
    }

    console.log('✓ Database URL found');
    console.log('');
    console.log('Creating database schema...');
    console.log('');

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        const schema = fs.readFileSync('database/schema.sql', 'utf8');
        await pool.query(schema);
        console.log('✅ Database schema created successfully!');
        console.log('');
        console.log('======================================');
        console.log('Database Ready!');
        console.log('======================================');
    } catch (err) {
        console.error('❌ Error creating schema:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

initDatabase();
