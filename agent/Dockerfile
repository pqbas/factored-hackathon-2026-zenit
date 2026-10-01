# The agent for AWS App Runner (spec/01-10-26-aws-agent). Build from agent/:
#   docker build -t bank-assistant-agent .
# No secret goes in the image: App Runner injects them at runtime.
# requirements-aws.lock pins the dependencies; regenerate it with
#   uv export --frozen --no-dev --no-hashes --no-emit-project -o requirements-aws.lock

FROM python:3.13-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.8 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
WORKDIR /app
COPY requirements-aws.lock .
RUN uv venv .venv && uv pip install --python .venv/bin/python -r requirements-aws.lock

FROM python:3.13-slim
ENV PATH=/app/.venv/bin:$PATH PYTHONUNBUFFERED=1
RUN useradd --create-home --uid 10001 agent
WORKDIR /app
COPY --from=build --chown=agent:agent /app/.venv .venv
COPY --chown=agent:agent src src
COPY --chown=agent:agent configs configs
USER agent
EXPOSE 8080
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8080"]
