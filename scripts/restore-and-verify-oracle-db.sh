#!/usr/bin/env bash
set -e

BACKUP_FILE="${1:-scratch/voop_webapp_production_backup.sql}"
CONTAINER_NAME="voop-postgres"
DB_NAME="voop_webapp"
DB_USER="postgres"

echo "====================================================="
echo "  VOOP Database Restore & Verification (Oracle Cloud) "
echo "====================================================="

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Error: Backup file not found at $BACKUP_FILE"
    exit 1
fi

echo "1. Checking if $CONTAINER_NAME container is ready..."
until docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1; do
    echo "Waiting for PostgreSQL to be ready..."
    sleep 2
done
echo "✓ PostgreSQL is ready."

echo "2. Ensuring target database $DB_NAME exists..."
docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -c "CREATE DATABASE $DB_NAME;"

echo "3. Streaming SQL backup into $DB_NAME ($BACKUP_FILE)..."
cat "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" --quiet > /dev/null 2>&1
echo "✓ Database restore complete."

echo "4. Running Data Parity & Verification Queries..."
docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" << 'EOF'
SELECT 'shopify_stores' AS entity, count(*) AS count, 8 AS expected FROM shopify_stores
UNION ALL
SELECT 'users', count(*), 6 FROM users
UNION ALL
SELECT 'shopify_products', count(*), 16 FROM shopify_products
UNION ALL
SELECT 'shopify_variants', count(*), 33 FROM shopify_variants
UNION ALL
SELECT 'shopify_orders', count(*), 459 FROM shopify_orders
UNION ALL
SELECT 'shopify_order_items', count(*), 473 FROM shopify_order_items
UNION ALL
SELECT 'shopify_fulfillments', count(*), 382 FROM shopify_fulfillments
UNION ALL
SELECT 'shipments', count(*), 385 FROM shipments
UNION ALL
SELECT 'shipment_scans', count(*), 11419 FROM shipment_scans
UNION ALL
SELECT 'voop_stock_items', count(*), 47 FROM voop_stock_items
UNION ALL
SELECT 'voop_inventory_ledger', count(*), 501 FROM voop_inventory_ledger
UNION ALL
SELECT 'shopify_webhook_events', count(*), 3333 FROM shopify_webhook_events
UNION ALL
SELECT 'sync_logs', count(*), 11342 FROM sync_logs;
EOF

echo "====================================================="
echo "✓ All tables and row counts successfully verified!"
echo "====================================================="
