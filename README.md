# ThrottleBox

Fixed-window rate limiter: Fastify + Redis + atomic Lua scripts.

## Run

```bash
npm install
docker run --name throttlebox-redis --rm -p 6379:6379 redis:7-alpine
npm run dev
