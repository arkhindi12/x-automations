# Database Migrations

## Overview

This project uses Drizzle ORM for database schema management and migrations.

## Commands

### Generate Migration Files
```bash
pnpm --filter @workspace/db run generate
```
This creates migration SQL files in `lib/db/drizzle/` based on schema changes.

### Run Migrations (Production)
```bash
pnpm --filter @workspace/db run migrate
```
This applies pending migrations to the database safely.

### Push Schema (Development Only)
```bash
pnpm --filter @workspace/db run push
```
⚠️ **Warning:** This directly pushes schema changes without creating migration files. Use only in development.

### Drizzle Studio (Database GUI)
```bash
pnpm --filter @workspace/db run studio
```
Opens a web interface to browse and edit database data.

## Migration Workflow

### Development
1. Make changes to schema files in `lib/db/src/schema/`
2. Generate migration: `pnpm --filter @workspace/db run generate`
3. Review generated SQL in `lib/db/drizzle/`
4. Apply migration: `pnpm --filter @workspace/db run migrate`

### Production
1. **Never use `push` in production**
2. Always use migration files generated in development
3. Test migrations in staging environment first
4. Run migrations before deploying new code:
   ```bash
   pnpm --filter @workspace/db run migrate
   ```

## Best Practices

1. **Always generate migrations** for schema changes
2. **Review migration SQL** before applying
3. **Test migrations** in development/staging first
4. **Backup database** before running migrations in production
5. **Never edit migration files** after they're generated
6. **Commit migration files** to version control

## Troubleshooting

### Migration fails
- Check DATABASE_URL is correct
- Ensure database is accessible
- Check for conflicting schema changes
- Review migration SQL for errors

### Reset database (development only)
```bash
# Drop all tables and re-run migrations
pnpm --filter @workspace/db run push-force
```

### Check migration status
Drizzle tracks applied migrations in `__drizzle_migrations` table.
