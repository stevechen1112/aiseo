FROM node:22-slim

RUN useradd -m -u 10001 sandbox
USER sandbox

WORKDIR /workspace

# Intentionally minimal: sandbox execution will mount workspace and run commands.
CMD ["node", "-e", "console.log('agent-sandbox ready')"]
