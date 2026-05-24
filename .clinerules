# AI Agent Instructions & Codebase Rules

You are an AI coding assistant working on the Cloudflare Workers Telegram Bot Monorepo.
To ensure the highest code quality, maintainability, and correctness, you must strictly adhere to the following enforcements and protocols.

## 1. Strict Type System & Linting (No Exceptions)

- **Strict Type Checking**: 
  - Absolute ban on the `any` type. Do not use `any` under any circumstances.
  - If a type is unknown or dynamic, use `unknown` combined with type guards, assertion functions, or generic types.
  - Do not use type assertions (`as Type`) to bypass type safety unless absolutely necessary (e.g. working with third-party libraries lacking proper typings).
- **No Compiler Bypasses**:
  - Do not use `// @ts-ignore`, `// @ts-nocheck`, or `// @ts-expect-error`.
  - All files must compile cleanly with `tsc --noEmit` and `svelte-check`.
- **Linting & Code Quality**:
  - Always resolve all ESLint warnings and errors. Do not ignore them.
  - Do not introduce unused variables, imports, or dead code.
- **Prettier & Formatting**:
  - Code must be formatted using Prettier.
  - Before declaring a task finished, format the workspace using the appropriate scripts.

## 2. Verification Protocol (Compile-Before-Done)

Before proposing any change as complete or claiming it works, you MUST verify the changes compile and run correctly.
- **Check shared packages**:
  `npm run check --prefix packages/shared`
- **Check Telegram bot worker**:
  `npm run check --prefix bot`
- **Check webapp (Svelte/Vite)**:
  `npm run check --prefix webapp`
  `npm run lint --prefix webapp`
- **Full Build check**:
  `npm run build`
- **Testing**:
  If the webapp has unit tests, verify they pass:
  `npm run test --prefix webapp`

## 3. Nix Token Efficiency & Environment Protocol

To optimize token usage, speed, and accuracy on this host environment, use specialized Nix tools instead of generic high-overhead commands:
- **Codebase Mapping**: Instead of exploring files manually, run:
  `nix run nixpkgs#repomix -- --include "src/**/*.ts,wrangler.toml"` to bundle project context.
- **Exploration & Listing**: Use `nix run nixpkgs#fd` or `nix run nixpkgs#tree` rather than `ls -R` or deep manual searches.
- **Log Processing**: Never `cat` or read raw logs larger than 50 lines. Filter them using `awk`, `sed`, or `jq` via Nix before ingesting.
- **Symbol Extraction**: Use `nix run nixpkgs#ctags -- -x` to find symbol definitions instead of manually opening source files.

## 4. Architecture & Monorepo Best Practices

- **Shared Code**: Business logic, common utilities, schemas, and shared types must be placed in `packages/shared/src/` to prevent duplication.
- **Secrets & Configuration**:
  - Never hardcode API keys, tokens, or credentials.
  - Local secrets go in `bot/.dev.vars` or `webapp/.dev.vars` (which must never be committed to git).
  - Public configuration goes in the respective `wrangler.toml` files.
- **Framework Conventions**:
  - **Svelte/Vite (webapp)**: Follow clean Svelte 4/5 patterns, keep components reactive, use appropriate styling.
  - **Cloudflare Workers (bot)**: Keep worker execution path lightweight and fast. Ensure asynchronous requests are fully resolved.

## 5. Style & Communication Guidelines

- **Token-dense / No fluff**: Keep model interactions concise and highly descriptive.
- **Logic Style**: Use `->` (results in) / `!` (not) in bullet points and planning docs.
- **Format**: Key: Value pairs / Snake_case_vars where applicable.
