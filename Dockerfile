# LinkPreflight MCP server (stdio). Glama/mcp-proxy wraps stdio as Streamable HTTP.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV NODE_ENV=production
# Health check: MCP initialize + tools/list handshake over stdio.
HEALTHCHECK --interval=30s --timeout=15s --start-period=5s --retries=3 CMD ["node", "--import", "tsx", "scripts/healthcheck.ts"]
CMD ["node", "--import", "tsx", "scripts/stdio.ts"]
