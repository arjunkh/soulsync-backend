# SoulSync Backend

This repository contains the Node.js backend for the SoulSync AI conversation system. It exposes REST endpoints to handle chat requests, manage user data and provide health status information.

## Setup

### Requirements
- Node.js 18+
- PostgreSQL instance
- OpenAI API key

### Installation
1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables:
   - `DATABASE_URL` – connection string for PostgreSQL.
   - `OPENAI_API_KEY` – your OpenAI key used for chat responses.
   - `PORT` – server port (defaults to `3001`).
   - `NODE_ENV` – set to `production` in production deployments.

3. Start the server:
   ```bash
   npm start
   ```
   The server will run on the port defined by `PORT`.

## Example API Usage

### Health Check
```bash
curl http://localhost:3001/api/health
```

### Chat Endpoint
```bash
curl -X POST http://localhost:3001/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Hello"}],"userId":"123"}'
```

### User Insights
```bash
curl http://localhost:3001/api/user-insights/123
```
