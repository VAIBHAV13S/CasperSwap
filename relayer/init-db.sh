#!/bin/bash

# Database initialization script for Neon PostgreSQL

set -e

echo "======================================"
echo "Initializing Neon Database"
echo "======================================"
echo ""

# Load environment variables
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL not found in .env"
    echo "Please add your Neon connection string to relayer/.env"
    exit 1
fi

echo "✓ Database URL found"
echo ""
echo "Creating database schema..."
echo ""

# Run schema using psql (requires PostgreSQL client)
if command -v psql &> /dev/null; then
    psql "$DATABASE_URL" -f database/schema.sql
    echo ""
    echo "✅ Database schema created successfully!"
else
    echo "⚠️  psql not found. Installing schema using Node.js..."
    node -e "
    const { Pool } = require('pg');
    const fs = require('fs');
    
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const schema = fs.readFileSync('database/schema.sql', 'utf8');
    
    pool.query(schema)
        .then(() => {
            console.log('✅ Database schema created successfully!');
            process.exit(0);
        })
        .catch(err => {
            console.error('❌ Error creating schema:', err);
            process.exit(1);
        });
    "
fi

echo ""
echo "======================================"
echo "Database Ready!"
echo "======================================"
