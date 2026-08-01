<h3 align="center">
<img src="https://raw.githubusercontent.com/codebam/cf-workers-telegram-bot/master/assets/logo.png" width="100" />
<br/>
CF Workers Telegram Bot
<br/>
</h3>

A monorepo containing a Telegram Bot and a Svelte web application, both running on Cloudflare Workers and Pages.

## Structure

This is a monorepo containing:

- `bot`: The main Telegram Bot built with [grammY](https://grammy.dev/) — [codebam/telegram-bot](https://github.com/codebam/telegram-bot) (submodule)
- `webapp`: A Svelte 5 web application for interacting with the bot — [codebam/telegram-webapp](https://github.com/codebam/telegram-webapp) (submodule)
- `packages/shared`: Types and helpers shared by both

## Setup

1. **Clone the repository with submodules**:

   ```sh
   git clone --recursive https://github.com/codebam/cf-workers-telegram-bot.git
   cd cf-workers-telegram-bot
   ```

2. **Install dependencies**:

   ```sh
   bun install
   ```

3. **Set up Git hooks** (runs the full build on every commit):

   ```sh
   ./setup_hooks.sh
   ```

4. **Authenticate wrangler**:

   ```sh
   bunx wrangler login
   ```

## Deployment

### Bot

1. **Configure**: edit `bot/wrangler.toml` with your worker name and bindings. Note that
   `[env.dev]` and `[env.production]` must point at **different** KV namespaces and
   Vectorize indexes.

2. **Set secrets**: get a token from [@BotFather](https://t.me/BotFather), then:

   ```sh
   cd bot
   bunx wrangler secret put SECRET_TELEGRAM_API_TOKEN --env production
   bunx wrangler secret put SECRET_TELEGRAM_WEBHOOK  --env production   # webhook shared secret
   bunx wrangler secret put SECRET_ADMIN_TOKEN       --env production   # guards GET /?command=set
   bunx wrangler secret put TAVILY_API_KEY           --env production   # optional, web search
   ```

   Repeat with `--env dev` for the development worker.

3. **Deploy**:

   ```sh
   make deploy-bot
   # or: cd bot && bunx wrangler deploy --env production
   ```

4. **Register the webhook** (once per deploy target):

   ```sh
   curl "https://<your-worker-host>/?command=set&token=<SECRET_ADMIN_TOKEN>"
   ```

For more on deploying grammY bots, see the [grammY deployment documentation](https://grammy.dev/guide/deployment).

### Web App

The web app is a SvelteKit project deployed to Cloudflare Pages.

```sh
make deploy-webapp
# or: cd webapp && bun run build && bunx wrangler pages deploy .svelte-kit/cloudflare
```

### Everything

```sh
make deploy
```

## Development

```sh
make build   # Build all projects
make clean   # Clean build artifacts

bun run --cwd bot start   # local worker via wrangler dev
bun run --cwd webapp dev  # local webapp via vite
```

## Continuous Deployment

CI runs on GitHub Actions (`.github/workflows/deploy.yml`):

| Trigger          | Action                              |
| ---------------- | ----------------------------------- |
| push to `master` | deploy bot to the `dev` environment |
| tag `bot-v*`     | deploy bot to `production`          |
| tag `webapp-v*`  | deploy webapp to Cloudflare Pages   |

Required repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `SECRET_TELEGRAM_API_TOKEN`, `SECRET_TELEGRAM_API_TOKEN_DEV`
- `TAVILY_API_KEY`

## License

Apache-2.0
