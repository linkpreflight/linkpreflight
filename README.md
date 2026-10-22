# LinkPreflight

A remote MCP server and API for AI agents. One `preflight(url)` call tells you whether a link is safe, live, and what's behind it (status, redirects, dead or parked, phishing flags, content type, llms.txt) before your agent clicks or fetches it.

- Site and docs: https://linkpreflight.dev
- MCP endpoint: https://linkpreflight.dev/mcp
- API: `GET https://linkpreflight.dev/v1/preflight?url=example.com`
- Free: 200 checks a day. Packs: $10 for 25,000 checks.

## Pairs well with

- [Clearcrawl](https://agentreader.onrender.com), from our studio: once a URL passes preflight, Clearcrawl turns it into clean markdown or JSON.
- [VibePicks](https://vibepicks.dev), from our studio: one clear verdict per AI dev-tool job.
