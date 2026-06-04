# X Automation Dashboard

Automated Twitter/X content extraction and posting system with scheduling, watermarking, and multi-account management.

## ✨ Features

- 🤖 **Automated Content Extraction** - Extract media from Twitter/X timelines
- 📅 **Smart Scheduling** - Schedule posts with flexible intervals
- 🎨 **Watermarking** - Add text or logo watermarks to images
- 👥 **Multi-Account Management** - Manage multiple X/Twitter accounts
- 🔄 **Proxy Support** - Rotate proxies to avoid rate limits
- 📊 **Analytics Dashboard** - Track performance and activity
- 🎯 **Target Management** - Monitor specific users or timelines
- 🔐 **Secure** - OAuth 1.0a and cookie-based authentication
- 📱 **Responsive UI** - Modern, mobile-friendly interface
- 🚦 **Rate Limiting** - Built-in API rate limiting
- 🧪 **Unit Tests** - Comprehensive test coverage
- 🐳 **Docker Support** - Easy containerized deployment
- 📈 **Performance Monitoring** - Track API response times
- 🔄 **CI/CD Ready** - GitHub Actions workflows included
- 🛡️ **Type Safe** - Full TypeScript support
- 📝 **Well Documented** - Comprehensive guides and API docs
- 🔍 **Session Monitoring** - Auto-detect expired credentials
- 🔁 **Auto-Retry** - Exponential backoff for failed requests
- 🎭 **User Agent Rotation** - Prevent bot detection
- 🔧 **Query ID Management** - Handle X/Twitter API changes

## 🚀 Quick Start

### Prerequisites

- Ubuntu 20.04 / 22.04 (or similar Linux distribution)
- Node.js 20.x
- PostgreSQL 12+
- pnpm (package manager)
- aaPanel (optional, for web hosting)

### Installation

#### Option 1: Automatic Installation (Recommended)

```bash
cd /www/wwwroot/x-automation
sudo bash install.sh
```

The script will automatically:
- Install Node.js, pnpm, PM2
- Install ffmpeg and yt-dlp
- Set up database
- Build and start the application

#### Option 2: Manual Installation

See [INSTALL.md](INSTALL.md) for detailed step-by-step instructions.

### Configuration

1. Copy environment template:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your settings:
   ```bash
   nano .env
   ```

3. Required variables:
   ```env
   DATABASE_URL=postgresql://user:password@localhost:5432/x_automation
   NODE_ENV=production
   PORT=3000
   FRONTEND_PORT=5000
   ```

### Running

```bash
# Start backend
pm2 start x-auto-api

# Start frontend
pm2 start x-auto-web

# View logs
pm2 logs

# Restart all
pm2 restart all
```

## 📖 Documentation

- [Installation Guide](INSTALL.md) - Detailed installation instructions
- [Docker Deployment](DOCKER.md) - Docker and Docker Compose setup
- [API Documentation](API.md) - API endpoints and usage
- [Security Guide](SECURITY.md) - Security best practices
- [Testing Guide](TESTING.md) - Unit testing guidelines
- [Database Migrations](lib/db/MIGRATIONS.md) - Database management
- [Auth Enhancement](AUTH_ENHANCEMENT.md) - Advanced authentication features

## 🏗️ Architecture

### Project Structure

```
x-automation/
├── artifacts/
│   ├── api-server/          # Backend API (Express + Node.js)
│   └── x-automation/        # Frontend UI (React + Vite)
├── lib/
│   ├── db/                  # Database schema (Drizzle ORM)
│   ├── api-zod/            # API validation schemas
│   └── api-client-react/   # React API client
├── .env.example            # Environment template
├── install.sh              # Auto-installer script
└── pnpm-workspace.yaml     # Monorepo configuration
```

### Tech Stack

**Backend:**
- Node.js 20 + Express 5
- TypeScript
- Drizzle ORM + PostgreSQL
- Pino (logging)
- Sharp (image processing)

**Frontend:**
- React 19
- Vite 7
- TanStack Query
- Tailwind CSS 4
- shadcn/ui components
- Wouter (routing)

## 🔧 Development

### Setup Development Environment

```bash
# Install dependencies
pnpm install

# Run database migrations
pnpm --filter @workspace/db run migrate

# Start development servers
pnpm run dev
```

This starts:
- Backend API on `http://localhost:3000`
- Frontend on `http://localhost:5000`

### Build for Production

```bash
# Type check
pnpm run typecheck

# Run tests
pnpm test

# Build all packages
pnpm run build
```

### Testing

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage
```

See [TESTING.md](TESTING.md) for detailed testing guidelines.

### Database Management

```bash
# Generate migration files
pnpm --filter @workspace/db run generate

# Run migrations
pnpm --filter @workspace/db run migrate

# Open Drizzle Studio (database GUI)
pnpm --filter @workspace/db run studio
```

See [lib/db/MIGRATIONS.md](lib/db/MIGRATIONS.md) for more details.

## 🔐 Security

### Rate Limiting

All API endpoints are rate-limited:
- General API: 100 requests / 15 minutes
- Authentication: 5 attempts / 15 minutes
- Job creation: 20 jobs / hour
- Media upload: 50 uploads / hour

### Authentication

Supports two authentication modes:

1. **OAuth 1.0a** (Recommended)
   - More stable and secure
   - Better rate limits
   - Requires Twitter Developer Account

2. **Cookie-based** (Alternative)
   - Easier setup
   - May expire more frequently
   - Good for testing

### Best Practices

- Use strong database passwords
- Enable SSL/TLS in production
- Rotate credentials regularly
- Monitor logs for suspicious activity
- Keep dependencies updated

See [SECURITY.md](SECURITY.md) for comprehensive security guidelines.

## 📊 Features in Detail

### Job Scheduling

Create automated jobs to extract and post content:

- **Schedule Types:**
  - Once (one-time execution)
  - Interval (repeat every X seconds)
  - Daily (specific time each day)
  - Cron (advanced scheduling)

- **Source Types:**
  - User timeline (specific user's tweets)
  - Home timeline (your feed)
  - Likes (liked tweets)

### Watermarking

Add watermarks to images before posting:

- **Text Watermark:**
  - Custom text
  - Font size and weight
  - Color and opacity
  - Position (9 positions)

- **Logo Watermark:**
  - Upload custom logo
  - Adjustable size and position
  - Transparency support

### Media Extraction

Smart extraction from various sources:

- Twitter/X native media
- External video platforms (via yt-dlp)
- Custom extractor profiles
- Automatic format detection

### Analytics

Track your automation performance:

- Posts published
- Media extracted
- Account health status
- Job execution history
- Activity timeline

## 🐛 Troubleshooting

### Common Issues

**Database connection failed**
```bash
# Check PostgreSQL is running
systemctl status postgresql

# Test connection
psql -U x_automation_user -d x_automation
```

**Port already in use**
```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>
```

**yt-dlp not found**
```bash
# Install yt-dlp
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp
```

**Credentials expired**
- Check account health in dashboard
- Re-authenticate account
- Update credentials

### Logs

```bash
# View all logs
pm2 logs

# View specific service
pm2 logs x-auto-api
pm2 logs x-auto-web

# View errors only
pm2 logs --err

# Clear logs
pm2 flush
```

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License.

## 🆘 Support

For issues or questions:

1. Check [INSTALL.md](INSTALL.md) for installation help
2. Review [API.md](API.md) for API usage
3. Check logs: `pm2 logs`
4. Review error messages in the dashboard

## 🔄 Updates

### Updating the Application

```bash
# Pull latest changes
git pull

# Install dependencies
pnpm install

# Run migrations
pnpm --filter @workspace/db run migrate

# Rebuild
pnpm run build

# Restart services
pm2 restart all
```

### Updating Dependencies

```bash
# Update all dependencies
pnpm update

# Update specific package
pnpm update <package-name>

# Check for outdated packages
pnpm outdated
```

## 🎯 Roadmap

- [ ] Multi-language support (i18n)
- [ ] Advanced analytics and reporting
- [ ] Webhook integrations
- [ ] Video watermarking
- [ ] Bulk operations
- [ ] API authentication
- [ ] Mobile app
- [ ] Docker support

## 📜 Changelog

### Version 1.0.0 (Current)

- Initial release
- Multi-account management
- Job scheduling
- Media extraction
- Watermarking
- Analytics dashboard
- Rate limiting
- Error handling
- Comprehensive logging

---

**Made with ❤️ by enowX Labs**

License: ENOWX-JNIHD-PO545-5OLSR-AX6J5
