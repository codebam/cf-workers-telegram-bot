.PHONY: build clean deploy deploy-bot deploy-webapp

build:
	npm run build

clean:
	rm -rf webapp/.svelte-kit
	rm -rf bot/dist

deploy-bot:
	npm run deploy --workspace bot

deploy-webapp:
	npm run build --workspace webapp
	npm run deploy --workspace webapp

deploy: deploy-bot deploy-webapp
