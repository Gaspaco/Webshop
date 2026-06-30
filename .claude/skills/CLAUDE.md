# MeloStudio

See [ARCHITECTURE.md](./ARCHITECTURE.md) for ecosystem map, URL builder rules, and recipes for adding pages, endpoints, and project fields.

## Context & Memory Strategy

- Do NOT proactively read files unless they are explicitly required for the current task.
- Query the Graphify index first if information is needed about project structure or dependencies.
- Only read specific file paths when asked, rather than scanning directories or context history.
- Maintain a "Lean Context" approach: If you have not been explicitly asked to analyze a file, treat it as "out of scope" to preserve token efficiency.
- You are prohibited from reading directories or scanning files proactively. Only read files explicitly named by the user. If you need context on structure, use the Graphify index. Do not perform any "analysis" of the codebase unless explicitly asked to.
