#!/bin/bash
# X Automation Database Export Script
# Usage: ./export-database.sh

set -e

echo "=========================================="
echo "X Automation Database Export"
echo "=========================================="
echo ""

# Configuration
EXPORT_DIR="./database-export-$(date +%Y%m%d-%H%M%S)"
LOCAL_HOST="localhost"
LOCAL_PORT="5433"
LOCAL_USER="postgres"
LOCAL_DB="x_automation"
PG_BIN="/tmp/pgsql/bin"

# Add PostgreSQL to PATH
export PATH="$PG_BIN:$PATH"

# Create export directory
mkdir -p "$EXPORT_DIR"
cd "$EXPORT_DIR"

echo "📦 Export directory: $EXPORT_DIR"
echo ""

# Test connection
echo "🔍 Testing database connection..."
if ! psql -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d $LOCAL_DB -c "SELECT 1" > /dev/null 2>&1; then
    echo "❌ Cannot connect to database. Make sure PostgreSQL is running."
    exit 1
fi
echo "✅ Database connection OK"
echo ""

# Get table list
echo "📋 Getting table list..."
TABLES=$(psql -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d $LOCAL_DB -t -c "
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    ORDER BY tablename;
" | tr -d ' ')

echo "Found tables:"
for table in $TABLES; do
    echo "  - $table"
done
echo ""

# Export full database dump
echo "💾 Exporting full database dump..."
pg_dump -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d $LOCAL_DB -F c -f full_backup.dump
echo "✅ Full dump: full_backup.dump"
echo ""

# Export as SQL
echo "💾 Exporting SQL format..."
pg_dump -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d $LOCAL_DB > full_backup.sql
echo "✅ SQL dump: full_backup.sql"
echo ""

# Export each table as CSV
echo "📊 Exporting tables as CSV..."
for table in $TABLES; do
    echo "  Exporting $table..."
    psql -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d $LOCAL_DB -c "\COPY $table TO '${table}.csv' CSV HEADER" > /dev/null 2>&1
    
    # Get row count
    COUNT=$(psql -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d $LOCAL_DB -t -c "SELECT COUNT(*) FROM $table" | tr -d ' ')
    echo "    ✅ $table.csv ($COUNT rows)"
done
echo ""

# Export schema only
echo "📐 Exporting schema only..."
pg_dump -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d $LOCAL_DB --schema-only > schema_only.sql
echo "✅ Schema: schema_only.sql"
echo ""

# Export data only
echo "📦 Exporting data only..."
pg_dump -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d $LOCAL_DB --data-only --column-inserts > data_only.sql
echo "✅ Data: data_only.sql"
echo ""

# Generate import script
echo "📝 Generating import script..."
cat > import-to-server.sh << 'IMPORT_SCRIPT'
#!/bin/bash
# X Automation Database Import Script
# Usage: ./import-to-server.sh

set -e

echo "=========================================="
echo "X Automation Database Import"
echo "=========================================="
echo ""

# Configuration (EDIT THESE)
DB_NAME="x_automation"
DB_USER="x_automation_user"
DB_PASSWORD="your_strong_password"  # CHANGE THIS!
IMPORT_METHOD="dump"  # Options: dump, sql, csv

echo "⚙️  Configuration:"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo "  Method: $IMPORT_METHOD"
echo ""

# Check if running as root or postgres user
if [ "$EUID" -ne 0 ] && [ "$(whoami)" != "postgres" ]; then 
    echo "⚠️  This script should be run as root or postgres user"
    echo "   Run: sudo bash import-to-server.sh"
    exit 1
fi

# Test PostgreSQL connection
echo "🔍 Testing PostgreSQL connection..."
if ! sudo -u postgres psql -c "SELECT 1" > /dev/null 2>&1; then
    echo "❌ Cannot connect to PostgreSQL"
    exit 1
fi
echo "✅ PostgreSQL connection OK"
echo ""

# Check if database exists
echo "🔍 Checking database..."
DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")
if [ "$DB_EXISTS" != "1" ]; then
    echo "❌ Database '$DB_NAME' does not exist. Create it first:"
    echo "   sudo -u postgres psql -c \"CREATE DATABASE $DB_NAME;\""
    exit 1
fi
echo "✅ Database exists"
echo ""

# Import based on method
case $IMPORT_METHOD in
    dump)
        echo "📥 Importing from full_backup.dump..."
        if [ ! -f "full_backup.dump" ]; then
            echo "❌ full_backup.dump not found"
            exit 1
        fi
        sudo -u postgres pg_restore -d $DB_NAME --clean --if-exists full_backup.dump 2>/dev/null || true
        echo "✅ Import complete"
        ;;
    
    sql)
        echo "📥 Importing from full_backup.sql..."
        if [ ! -f "full_backup.sql" ]; then
            echo "❌ full_backup.sql not found"
            exit 1
        fi
        sudo -u postgres psql -d $DB_NAME < full_backup.sql
        echo "✅ Import complete"
        ;;
    
    csv)
        echo "📥 Importing from CSV files..."
        
        # Import schema first
        if [ -f "schema_only.sql" ]; then
            echo "  Creating schema..."
            sudo -u postgres psql -d $DB_NAME < schema_only.sql 2>/dev/null || true
        fi
        
        # Import each CSV
        for csv_file in *.csv; do
            if [ -f "$csv_file" ]; then
                table_name="${csv_file%.csv}"
                echo "  Importing $table_name..."
                sudo -u postgres psql -d $DB_NAME -c "\COPY $table_name FROM '$csv_file' CSV HEADER" 2>/dev/null || echo "    ⚠️  Failed to import $table_name"
            fi
        done
        echo "✅ Import complete"
        ;;
    
    *)
        echo "❌ Invalid import method: $IMPORT_METHOD"
        echo "   Valid options: dump, sql, csv"
        exit 1
        ;;
esac

echo ""
echo "🔧 Setting permissions..."
sudo -u postgres psql -d $DB_NAME << EOF
REASSIGN OWNED BY postgres TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF
echo "✅ Permissions set"
echo ""

# Verify import
echo "📊 Verifying import..."
sudo -u postgres psql -d $DB_NAME << 'EOF'
SELECT 
    schemaname,
    tablename,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = tablename) as columns,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;
EOF

echo ""
echo "✅ Import verification complete"
echo ""
echo "=========================================="
echo "Import finished successfully!"
echo "=========================================="
IMPORT_SCRIPT

chmod +x import-to-server.sh
echo "✅ Import script: import-to-server.sh"
echo ""

# Generate README
cat > README.md << 'README'
# X Automation Database Export

## Files

- `full_backup.dump` - PostgreSQL custom format (recommended)
- `full_backup.sql` - Plain SQL format
- `schema_only.sql` - Database schema only
- `data_only.sql` - Data only (with INSERT statements)
- `*.csv` - Individual table exports
- `import-to-server.sh` - Import script for server

## Import to Server

### Method 1: Using dump file (Recommended)

```bash
# Upload to server
scp -r database-export-* root@your-server-ip:/tmp/

# SSH to server
ssh root@your-server-ip

# Go to export directory
cd /tmp/database-export-*

# Edit import script configuration
nano import-to-server.sh
# Change DB_PASSWORD and other settings

# Run import
sudo bash import-to-server.sh
```

### Method 2: Manual import

```bash
# Create database first
sudo -u postgres psql -c "CREATE DATABASE x_automation;"
sudo -u postgres psql -c "CREATE USER x_automation_user WITH PASSWORD 'your_password';"

# Import from dump
sudo -u postgres pg_restore -d x_automation full_backup.dump

# Or import from SQL
sudo -u postgres psql -d x_automation < full_backup.sql

# Set permissions
sudo -u postgres psql -d x_automation << EOF
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO x_automation_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO x_automation_user;
EOF
```

### Method 3: CSV import

```bash
# Import schema first
sudo -u postgres psql -d x_automation < schema_only.sql

# Import each CSV
sudo -u postgres psql -d x_automation -c "\COPY accounts FROM 'accounts.csv' CSV HEADER"
sudo -u postgres psql -d x_automation -c "\COPY media FROM 'media.csv' CSV HEADER"
sudo -u postgres psql -d x_automation -c "\COPY jobs FROM 'jobs.csv' CSV HEADER"
# ... repeat for all tables
```

## Verify Import

```bash
sudo -u postgres psql -d x_automation

-- Check table counts
SELECT 'accounts' as table_name, COUNT(*) FROM accounts
UNION ALL
SELECT 'media', COUNT(*) FROM media
UNION ALL
SELECT 'jobs', COUNT(*) FROM jobs
UNION ALL
SELECT 'settings', COUNT(*) FROM settings;

-- Check sample data
SELECT * FROM accounts LIMIT 3;

\q
```

## Troubleshooting

### Permission denied
```bash
sudo chown -R postgres:postgres /tmp/database-export-*
```

### Database already exists
```bash
sudo -u postgres psql -c "DROP DATABASE x_automation;"
sudo -u postgres psql -c "CREATE DATABASE x_automation;"
```

### Import errors
Check import method in `import-to-server.sh`:
- `IMPORT_METHOD="dump"` - Use .dump file (recommended)
- `IMPORT_METHOD="sql"` - Use .sql file
- `IMPORT_METHOD="csv"` - Use CSV files
README

echo "✅ README: README.md"
echo ""

# Create archive
echo "📦 Creating archive..."
cd ..
tar -czf "${EXPORT_DIR}.tar.gz" "$(basename $EXPORT_DIR)"
echo "✅ Archive: ${EXPORT_DIR}.tar.gz"
echo ""

# Summary
echo "=========================================="
echo "✅ Export Complete!"
echo "=========================================="
echo ""
echo "📁 Export location: $EXPORT_DIR"
echo "📦 Archive: ${EXPORT_DIR}.tar.gz"
echo ""
echo "📊 Export summary:"
for table in $TABLES; do
    if [ -f "$EXPORT_DIR/${table}.csv" ]; then
        COUNT=$(wc -l < "$EXPORT_DIR/${table}.csv")
        COUNT=$((COUNT - 1))  # Subtract header
        echo "  - $table: $COUNT rows"
    fi
done
echo ""
echo "📤 To upload to server:"
echo "  scp ${EXPORT_DIR}.tar.gz root@your-server-ip:/tmp/"
echo ""
echo "📥 On server, extract and run:"
echo "  cd /tmp"
echo "  tar -xzf ${EXPORT_DIR}.tar.gz"
echo "  cd $(basename $EXPORT_DIR)"
echo "  nano import-to-server.sh  # Edit DB_PASSWORD"
echo "  sudo bash import-to-server.sh"
echo ""
