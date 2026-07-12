# Agent Scope Guardrails

This folder contains source text for Magic: The Gathering comprehensive rules.
It is content data, not application code/specs for feature implementation.

## Default Behavior

- Do not search, parse, chunk, summarize, or otherwise read files in this folder.
- Do not include this folder in broad grep/semantic search operations.
- Treat this folder as out-of-scope for implementation/debugging tasks.

## Allowed Exceptions

- Only access this folder when the user explicitly asks for work inside `comprehensive-rules/`.
- If access is needed, keep reads narrowly targeted to the exact files requested.
