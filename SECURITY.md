# Security Best Practices

## Overview

This document outlines security best practices for deploying and maintaining the X Automation Dashboard.

## Environment Variables

### Protection
- ✅ Never commit `.env` files to version control
- ✅ Use `.env.example` as a template only
- ✅ Use strong, unique passwords for database
- ✅ Rotate credentials regularly (every 90 days)

### Required Variables
```bash
DATABASE_URL=postgresql://user:password@host:port/database
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
```

### Optional but Recommended
```bash
# Proxy service credentials (if using 9Proxy)
NINEPROXY_API_KEY=your_key_here
NINEPROXY_GATEWAY=your_gateway_here
```

## Database Security

### PostgreSQL Configuration

1. **Use Strong Passwords**
   ```sql
   -- Minimum 16 characters, mixed case, numbers, symbols
   CREATE USER x_automation_user WITH PASSWORD 'Str0ng!P@ssw0rd#2024';
   ```

2. **Limit Permissions**
   ```sql
   -- Grant only necessary permissions
   GRANT CONNECT ON DATABASE x_automation TO x_automation_user;
   GRANT USAGE ON SCHEMA public TO x_automation_user;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO x_automation_user;
   ```

3. **Enable SSL Connections**
   ```bash
   # In postgresql.conf
   ssl = on
   ssl_cert_file = '/path/to/server.crt'
   ssl_key_file = '/path/to/server.key'
   ```

4. **Regular Backups**
   ```bash
   # Daily backup script
   pg_dump -U x_automation_user x_automation > backup_$(date +%Y%m%d).sql
   ```

## API Security

### Rate Limiting

Rate limiting is enabled by default:
- General API: 100 requests per 15 minutes
- Authentication: 5 attempts per 15 minutes
- Sensitive operations: 10 requests per 15 minutes

### CORS Configuration

In production, restrict CORS to your domain:

```typescript
// artifacts/api-server/src/app.ts
app.use(cors({
  origin: 'https://your-domain.com',
  credentials: true
}));
```

### Input Validation

All inputs are validated using Zod schemas. Never trust user input.

## X/Twitter Credentials

### Storage
- ✅ Credentials are stored encrypted in database
- ✅ Sensitive fields are masked in logs
- ✅ API responses exclude sensitive data

### OAuth vs Cookies

**OAuth 1.0a (Recommended)**
- More secure
- Better rate limits
- Longer-lived credentials
- Requires Twitter Developer Account

**Cookie-based (Alternative)**
- Easier setup
- May expire frequently
- Requires re-authentication
- Use only for testing

### Credential Rotation

1. Monitor health checks for expired credentials
2. Update credentials immediately when expired
3. Use separate accounts for testing and production

## Server Security

### Firewall Configuration

```bash
# Allow only necessary ports
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 5432/tcp  # PostgreSQL (only from localhost)
ufw enable
```

### SSH Security

```bash
# Disable password authentication
# Edit /etc/ssh/sshd_config
PasswordAuthentication no
PubkeyAuthentication yes
PermitRootLogin no

# Restart SSH
systemctl restart sshd
```

### SSL/TLS Certificates

Use Let's Encrypt for free SSL certificates:

```bash
# Install certbot
apt-get install certbot

# Get certificate (via aaPanel or manually)
certbot certonly --webroot -w /www/wwwroot/your-domain -d your-domain.com
```

### Automatic Updates

```bash
# Enable automatic security updates
apt-get install unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

## Application Security

### Process Management

```bash
# Run as non-root user
pm2 start app.js --user www-data

# Set resource limits
pm2 start app.js --max-memory-restart 500M
```

### Logging

- ✅ Logs are structured and searchable
- ✅ Sensitive data is masked in logs
- ✅ Log rotation is enabled
- ✅ Logs are monitored for suspicious activity

```bash
# View logs
pm2 logs x-auto-api

# Monitor for errors
pm2 logs x-auto-api --err
```

### Monitoring

Set up monitoring for:
- CPU and memory usage
- Disk space
- Database connections
- API response times
- Error rates

```bash
# PM2 monitoring
pm2 monit

# System monitoring
htop
```

## Proxy Security

If using proxy services:

1. **Validate Proxy URLs**
   - Only allow http, https, socks4, socks5 protocols
   - Validate format before saving

2. **Rotate Proxies**
   - Use proxy rotation to avoid rate limits
   - Monitor proxy health

3. **Secure Proxy Credentials**
   - Store proxy credentials encrypted
   - Never log full proxy URLs with credentials

## Incident Response

### If Credentials are Compromised

1. **Immediately revoke compromised credentials**
   ```bash
   # Disable account in dashboard
   # Revoke tokens in Twitter Developer Portal
   ```

2. **Rotate all related credentials**
   - Database passwords
   - API keys
   - Proxy credentials

3. **Review logs for suspicious activity**
   ```bash
   pm2 logs x-auto-api | grep -i "error\|failed\|suspicious"
   ```

4. **Update and redeploy**
   ```bash
   # Update credentials
   nano .env
   
   # Restart services
   pm2 restart all
   ```

### Security Checklist

- [ ] Strong database password set
- [ ] `.env` file not in version control
- [ ] SSL certificate installed and auto-renewing
- [ ] Firewall configured and enabled
- [ ] SSH password authentication disabled
- [ ] Regular backups configured
- [ ] Monitoring and alerting set up
- [ ] Rate limiting enabled
- [ ] CORS restricted to your domain
- [ ] Logs reviewed regularly
- [ ] Credentials rotated every 90 days

## Compliance

### Data Protection

- User data is stored securely in PostgreSQL
- Credentials are encrypted at rest
- Sensitive data is masked in logs
- Regular backups are maintained

### Privacy

- No user tracking or analytics by default
- Logs contain only necessary information
- Data retention policies should be defined

## Regular Maintenance

### Weekly
- [ ] Review error logs
- [ ] Check disk space
- [ ] Monitor API response times

### Monthly
- [ ] Update dependencies
- [ ] Review security logs
- [ ] Test backup restoration
- [ ] Check for expired credentials

### Quarterly
- [ ] Rotate database passwords
- [ ] Update SSL certificates (if not auto-renewing)
- [ ] Security audit
- [ ] Performance review

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/security.html)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
