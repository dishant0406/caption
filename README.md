# 🎬 WhatsApp Video Captioning Bot

A scalable WhatsApp bot that automatically transcribes and adds beautiful captions to videos using OpenAI Whisper and FFmpeg.

## 🌟 Features

- **Automatic Transcription**: Uses OpenAI Whisper for accurate speech-to-text
- **Video Chunking**: Splits videos into 15-30s segments for review
- **Multiple Caption Styles**: 10+ pre-built caption templates
- **User Approval Workflow**: Review and edit captions per chunk
- **Low-res Preview**: Fast preview generation before HD rendering
- **Freemium Model**: 2 free videos, then paid subscription
- **AI-Powered Agent**: Mastra-based conversational AI for natural interactions
- **Input Guardrails**: Multi-layered security against prompt injection, spam, and inappropriate content

## 🏗️ Architecture

This project uses a monorepo structure with two main services:

```
caption/
├── apps/
│   ├── caption-api/       # Main API service (WhatsApp webhook, user management)
│   └── video-worker/      # Video processing worker (FFmpeg, transcription)
├── packages/
│   └── shared/            # Shared types, constants, and utilities
├── docker-compose.yml     # Local development infrastructure
└── pnpm-workspace.yaml    # Workspace configuration
```

### Services Overview

| Service | Port | Description |
|---------|------|-------------|
| caption-api | 3000 | Express.js API handling WhatsApp webhooks, user sessions, and job dispatching |
| video-worker | - | Background worker processing video transcription and rendering jobs |
| PostgreSQL | 5432 | Primary database for users, sessions, and chunks |
| Redis | 6379 | Job queue (Pub/Sub) and caching |

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+
- **pnpm** 8+ (`npm install -g pnpm`)
- **Docker** and **Docker Compose**
- **FFmpeg** (for video processing)
- **OpenAI API Key** (for Whisper transcription)
- **Azure Storage Account** (for video storage)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd caption
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Start infrastructure services**
   ```bash
   docker-compose up -d
   ```

4. **Configure environment variables**
   ```bash
   # Copy example files
   cp apps/caption-api/.env.example apps/caption-api/.env
   cp apps/video-worker/.env.example apps/video-worker/.env
   
   # Edit the .env files with your actual values
   ```

5. **Build shared package**
   ```bash
   pnpm build:shared
   ```

6. **Start development servers**
   ```bash
   # Terminal 1 - API Service
   pnpm dev:api
   
   # Terminal 2 - Video Worker
   pnpm dev:worker
   ```

### Environment Variables

#### Caption API (`apps/caption-api/.env`)

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | Environment (development/production) | Yes |
| `PORT` | Server port | Yes |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `WHATSAPP_SOCKET_URL` | WhatsApp socket server URL | Yes |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Blob Storage connection | Yes |
| `OPENAI_API_KEY` | OpenAI API key for Whisper | Yes |

#### Video Worker (`apps/video-worker/.env`)

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | Environment | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Blob Storage connection | Yes |
| `OPENAI_API_KEY` | OpenAI API key | Yes |
| `FFMPEG_PATH` | Custom FFmpeg path | No |
| `WORKER_CONCURRENCY` | Number of concurrent jobs | No |

## 📦 Project Structure

```
apps/caption-api/
├── src/
│   ├── config/           # Environment validation and configuration
│   ├── models/           # Sequelize models (User, CaptionSession, VideoChunk)
│   ├── plugins/          # Reusable plugins (logger, cache, queue)
│   ├── services/         # Business logic services
│   │   └── whatsapp/     # WhatsApp message handling
│   ├── app.ts            # Express app setup
│   └── server.ts         # Server entry point

apps/video-worker/
├── src/
│   ├── config/           # Environment validation
│   ├── plugins/          # Logger, cache, queue
│   ├── services/         # Core services
│   │   ├── storage/      # Azure Blob Storage
│   │   ├── ffmpeg/       # Video processing
│   │   └── transcription/# OpenAI Whisper
│   ├── processors/       # Job processors
│   └── worker.ts         # Worker entry point

packages/shared/
├── src/
│   ├── types/            # TypeScript type definitions
│   │   ├── job.types.ts  # Job queue types
│   │   ├── video.types.ts# Video/session types
│   │   └── caption.types.ts# Caption styling types
│   └── constants/        # Shared constants
│       ├── captionStyles.ts# Pre-built caption styles
│       └── limits.ts     # Tier limits and config
```

## 🎨 Caption Styles

The bot includes 10 pre-built caption styles:

1. **Clean White** - Minimal white text with shadow
2. **Bold Yellow** - YouTube-style bold yellow
3. **Neon Glow** - Cyan text with glow effect
4. **Elegant Serif** - Classic serif font
5. **Street Style** - Urban graffiti look
6. **Soft Pink** - Feminine pink gradient
7. **Corporate Blue** - Professional business style
8. **Retro Orange** - 70s vintage look
9. **Minimalist** - Simple, thin font
10. **High Contrast** - Black text on white background

## 🔄 Job Flow

```
1. User sends video via WhatsApp
         ↓
2. caption-api receives webhook
         ↓
3. Video uploaded to Azure Blob Storage
         ↓
4. VIDEO_UPLOAD job published to Redis
         ↓
5. video-worker processes:
   - Split into chunks
   - Generate previews
         ↓
6. TRANSCRIPTION job for each chunk
         ↓
7. video-worker transcribes with Whisper
         ↓
8. User reviews/approves each chunk
         ↓
9. PREVIEW_GENERATION job
         ↓
10. User selects caption style
         ↓
11. FINAL_RENDER job
         ↓
12. HD video sent back via WhatsApp
```

## 🛠️ Development Commands

```bash
# Install dependencies
pnpm install

# Start all services in development
pnpm dev

# Start individual services
pnpm dev:api      # Start caption-api
pnpm dev:worker   # Start video-worker

# Build all packages
pnpm build

# Build shared package only
pnpm build:shared

# Type checking
pnpm type-check

# Linting
pnpm lint
pnpm lint:fix

# Docker commands
docker-compose up -d              # Start PostgreSQL + Redis
docker-compose --profile tools up # Include pgAdmin + Redis Commander
docker-compose down               # Stop all services
```

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage
```

## 📝 API Endpoints

### Health Check
```
GET /health
```

### Webhook (for WhatsApp)
```
POST /webhook
```

## 🛡️ Security & Guardrails

The bot implements comprehensive input guardrails to protect against malicious inputs and abuse. See [GUARDRAILS.md](./docs/GUARDRAILS.md) for detailed documentation.

**Implemented Protections**:
- Unicode normalization and control character stripping
- Rate limiting and spam detection
- Prompt injection attack detection
- Content moderation (hate, harassment, violence, etc.)

**Configuration** (in `.env`):
```bash
GUARDRAILS_ENABLED=true
GUARDRAILS_PROMPT_INJECTION_ENABLED=true
GUARDRAILS_MODERATION_ENABLED=true
GUARDRAILS_SPAM_MAX_PER_MINUTE=15
```

## 🚢 Deployment

### Azure Deployment (Recommended)

1. Create Azure resources:
   - Azure App Service (P2 tier)
   - Azure Blob Storage
   - Azure Database for PostgreSQL
   - Azure Cache for Redis

2. Configure environment variables in App Service

3. Deploy using GitHub Actions or Azure DevOps

## 📄 License

MIT License

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📞 Support

For issues and questions, please open a GitHub issue.
