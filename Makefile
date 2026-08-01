.PHONY: build clean deploy deploy-bot deploy-webapp

build:
	bun run build

clean:
	rm -rf webapp/.svelte-kit
	rm -rf bot/dist

deploy-bot:
	bun run --cwd bot deploy

deploy-webapp:
	bun run --cwd webapp build
	bun run --cwd webapp deploy

deploy: deploy-bot deploy-webapp
