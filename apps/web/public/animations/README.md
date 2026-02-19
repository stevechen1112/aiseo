# Agent Field Animation Assets

This folder stores animation assets for Agent Field view.

## Rive setup

1. Default sample already included:
   - `public/animations/agent-bot.riv` (from Rive CDN sample, for integration testing)
2. For production, replace with your chosen **free commercial-use** robot `.riv` animation.
3. Set env in web app:
   - `NEXT_PUBLIC_RIVE_AGENT_SRC=/animations/agent-bot.riv`

If `NEXT_PUBLIC_RIVE_AGENT_SRC` is not set, UI automatically falls back to `AgentBotAnimated` (Framer Motion + SVG).

## License tracking

Before replacing asset, update `assets-license.json` with:
- source URL
- author
- license
- attribution requirement
- download date
