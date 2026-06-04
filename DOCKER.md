# Docker Deployment Guide

## Quick Start

### 1. Prerequisites

- Docker 20.10+
- Docker Compose 2.0+

### 2. Setup Environment

```bash
# Copy environment template
cp .env.docker .env

# Edit environment variables
nano .env
```

**Important:** Change `POSTGRES_PASSWORD` to a strong password!

### 3. Build and Start

```bash
# Build images
docker-compose build

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

### 4. Run Database Migrations

```bash
# Run migrations
docker-compose exec api-server node -e "
  const { migrate } = require('drizzle-orm/node-postgres/migrator');
  const { drizzle } = require('drizzle-orm/node-postgres');
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  migrate(db, { migrationsFolder: './lib/db/drizzle' }).then(() => {
    console.log('Migrations completed');
    process.exit(0);
  }).catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
"
```

Or use the push command (development only):
```bash
docker-compose exec api-server pnpm --filter @workspace/db run push
```

### 5. Access Application

- Frontend: http://localhost:5000
- API: http://localhost:3000
- Database: localhost:5432

## Services

### PostgreSQL Database
- Container: `x-automation-db`
- Port: 5432
- Data: Persisted in `postgres_data` volume

### API Server
- Container: `x-automation-api`
- Port: 3000
- Logs: `./logs` directory

### Frontend
- Container: `x-automation-web`
- Port: 5000

### Nginx (Optional)
- Container: `x-automation-nginx`
- Ports: 80, 443
- Enable with: `docker-compose --profile with-nginx up -d`

## Common Commands

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api-server
docker-compose logs -f frontend
docker-compose logs -f postgres
```

### Restart Services
```bash
# All services
docker-compose restart

# Specific service
docker-compose restart api-server
```

### Stop Services
```bash
# Stop all
docker-compose stop

# Stop and remove containers
docker-compose down

# Stop and remove everything (including volumes)
docker-compose down -v
```

### Execute Commands in Container
```bash
# Shell access
docker-compose exec api-server sh

# Run pnpm command
docker-compose exec api-server pnpm --filter @workspace/db run studio

# Database shell
docker-compose exec postgres psql -U x_automation_user -d x_automation
```

### Update Application
```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose build
docker-compose up -d

# Run migrations
docker-compose exec api-server pnpm --filter @workspace/db run migrate
```

## Production Deployment

### 1. Use Nginx Reverse Proxy

```bash
# Start with nginx
docker-compose --profile with-nginx up -d
```

### 2. Configure SSL

```bash
# Create SSL directory
mkdir -p ssl

# Copy your SSL certificates
cp /path/to/cert.pem ssl/
cp /path/to/key.pem ssl/

# Update nginx.conf to enable HTTPS
nano nginx.conf
```

### 3. Environment Variables

Set production values in `.env`:
```env
NODE_ENV=production
LOG_LEVEL=info
POSTGRES_PASSWORD=very_strong_password_here
```

### 4. Resource Limits

Add to `docker-compose.yml`:
```yaml
services:
  api-server:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### 5. Health Checks

Health checks are configured for all services:
- PostgreSQL: `pg_isready`
- API Server: `curl http://localhost:3000/api/health`
- Frontend: `curl http://localhost:5000`

### 6. Backup Database

```bash
# Backup
docker-compose exec postgres pg_dump -U x_automation_user x_automation > backup.sql

# Restore
docker-compose exec -T postgres psql -U x_automation_user x_automation < backup.sql
```

## Monitoring

### View Resource Usage
```bash
docker stats
```

### Check Container Health
```bash
docker-compose ps
```

### Inspect Logs
```bash
# Last 100 lines
docker-compose logs --tail=100

# Follow logs
docker-compose logs -f

# Specific service with timestamp
docker-compose logs -f --timestamps api-server
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs api-server

# Check container status
docker-compose ps

# Restart container
docker-compose restart api-server
```

### Database Connection Issues

```bash
# Check database is running
docker-compose ps postgres

# Test connection
docker-compose exec postgres pg_isready -U x_automation_user

# Check logs
docker-compose logs postgres
```

### Port Already in Use

```bash
# Find process using port
lsof -i :3000

# Change port in .env
API_PORT=3001
```

### Out of Disk Space

```bash
# Clean up unused images
docker system prune -a

# Remove old volumes
docker volume prune
```

### Reset Everything

```bash
# Stop and remove everything
docker-compose down -v

# Remove images
docker-compose down --rmi all

# Start fresh
docker-compose up -d
```

## Performance Tuning

### PostgreSQL

Add to `docker-compose.yml`:
```yaml
postgres:
  command:
    - "postgres"
    - "-c"
    - "shared_buffers=256MB"
    - "-c"
    - "max_connections=200"
```

### Node.js

Set environment variables:
```yaml
api-server:
  environment:
    NODE_OPTIONS: "--max-old-space-size=2048"
```

## Security Best Practices

1. **Change Default Passwords**
   - Set strong `POSTGRES_PASSWORD`
   - Don't use default credentials

2. **Use SSL/TLS**
   - Enable HTTPS in nginx
   - Use valid SSL certificates

3. **Limit Exposed Ports**
   - Don't expose database port publicly
   - Use nginx as reverse proxy

4. **Regular Updates**
   - Update base images regularly
   - Keep dependencies up to date

5. **Monitor Logs**
   - Check logs for suspicious activity
   - Set up log aggregation

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build and push
        run: |
          docker-compose build
          docker-compose push
      
      - name: Deploy to server
        run: |
          ssh user@server 'cd /app && docker-compose pull && docker-compose up -d'
```

## Scaling

### Horizontal Scaling

```yaml
services:
  api-server:
    deploy:
      replicas: 3
```

### Load Balancing

Use nginx upstream with multiple backends:
```nginx
upstream api {
    server api-server-1:3000;
    server api-server-2:3000;
    server api-server-3:3000;
}
```

## Support

For issues:
1. Check logs: `docker-compose logs`
2. Verify configuration: `docker-compose config`
3. Test connectivity: `docker-compose exec api-server curl http://localhost:3000/api/health`
