# VenturePath voice agent (LiveKit Agents worker on Gemini Live).
FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:0.12.18 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Dependencies first so code changes don't reinstall them.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev --no-install-project

COPY README.md NOTICE LICENSE-APACHE ./
COPY src ./src
RUN uv sync --locked --no-dev

RUN useradd --create-home --uid 10001 agent
USER agent

CMD ["uv", "run", "--no-sync", "python", "-m", "voice_agent.worker", "start"]
