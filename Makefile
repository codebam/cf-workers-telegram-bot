.PHONY: build clean deploy

build:
	bun run build

clean:
	rm -rf webapp/.svelte-kit
	rm -rf bot/dist

deploy:
	bun run --cwd bot deploy
	bun run --cwd webapp build && bunx wrangler pages deploy .svelte-kit/cloudflare
