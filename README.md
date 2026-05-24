<h3 align="center">
<img src="https://raw.githubusercontent.com/codebam/cf-workers-telegram-bot/master/assets/logo.png" width="100" />
<br/>
CF Workers Telegram Bot
<br/>
</h3>

> 🚀 **This project has moved to [Codeberg](https://codeberg.org/codebam/cf-workers-telegram-bot)**

A monorepo containing a Telegram Bot and a Svelte web application, both running on Cloudflare Workers and Pages.

## Structure

This is a monorepo containing:
- `bot`: The main Telegram Bot built with [grammY](https://grammy.dev/)
- `webapp`: A Svelte 5 web application for interacting with the bot

## Deployment

### Deploying the Bot

1. **Clone the repository with submodules**:

   ```sh
   git clone --recursive https://github.com/codebam/cf-workers-telegram-bot.git
   ```

2. **Install dependencies**:

   ```sh
   bun install
   ```

3. **Configure the bot**:
   Navigate to the `bot` directory and update `wrangler.toml` with your desired worker name and bindings.

4. **Set your Telegram Token**:
   Get a token from [@BotFather](https://t.me/BotFather) and add it to your worker:

   ```sh
   cd bot
   bunx wrangler-native-bun secret put SECRET_TELEGRAM_API_TOKEN
   ```

5. **Deploy**:

   ```sh
   bun run deploy
   ```

For more information on deploying grammY bots, see the [grammY deployment documentation](https://grammy.dev/guide/deployment).

### Deploying the Web App

The web app is a SvelteKit project designed to be deployed to Cloudflare Pages.

```sh
cd webapp
bun install
bun run build
bunx wrangler-native-bun pages deploy .svelte-kit/cloudflare
```

## Development

You can use the root `Makefile` to run common tasks across all projects:

```sh
make build   # Build all projects
make clean   # Clean build artifacts
```

### Setup

1. **Install dependencies**:
   ```sh
   bun install
   ```

2. **Set up Git hooks**:
   This project uses custom Git hooks for quality control. Run the following script to enable them:
   ```sh
   ./setup_hooks.sh
   ```

## License

Apache-2.0
