.PHONY: help setup dev build build-types package publish publish-rc publish-dry clean clean-dist preview lint test test-watch test-e2e test-e2e-ui test-e2e-headed test-e2e-install kill-port check-version update-deps image-build image-run image-stop image-clean

# This is a monorepo (npm workspaces). The publishable package lives in
# packages/editor; root scripts fan out across workspaces. PKG targets that one
# package explicitly (npm's -w) for pack/publish/preview.
PKG     := @keenmate/web-editor
PKG_DIR := packages/editor

# Per-developer overrides (container runner, image name, port). Optional: the
# leading `-` means it's fine if the file is absent. Defaults below apply when a
# value isn't set. Copy or edit .makefile.env to switch the runner (e.g.
# DOCKER_RUNNER = docker).
-include .makefile.env
DOCKER_RUNNER  ?= podman
IMAGE_NAME     ?= registry.km8.es/web-editor-examples:prod
CONTAINER_NAME ?= web-editor-examples
IMAGE_PORT     ?= 12410

help: ## Show this help message
	@echo "Available targets:"
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-18s %s\n", $$1, $$2}'

setup: ## Install dependencies and prepare project
	@echo "Installing dependencies..."
	npm install
	@echo "Setup complete"

dev: ## Start development server with hot reload (port 21113)
	@echo "Starting development server..."
	@rm -rf $(PKG_DIR)/node_modules/.vite node_modules/.vite
	npm run dev

# Free the vite dev-server ports. Vite starts at 21113 and hops to the next free
# port when one is busy, so a stale run can hold any of 21113-21118. Kills whatever
# is LISTENING on those ports, covering both IPv4 and IPv6 (vite binds [::1] too).
# On Windows a one-line PowerShell call does the work; on *nix we use lsof. `$$_`
# escapes make's `$`, and the command is single-quoted so sh doesn't expand `$_`
# (its own last-arg variable) before PowerShell receives a literal `$_`.
kill-port: ## Free the vite dev-server ports (21113-21118)
	@echo "Freeing ports 21113-21118..."
ifeq ($(OS),Windows_NT)
	-@powershell -NoProfile -Command '21113..21118 | ForEach-Object { Get-NetTCPConnection -LocalPort $$_ -State Listen -ErrorAction SilentlyContinue } | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $$_ -Force -ErrorAction SilentlyContinue }'
else
	-@for p in 21113 21114 21115 21116 21117 21118; do lsof -ti tcp:$$p | xargs -r kill -9; done
endif
	@echo "Ports 21113-21118 are free"

build: ## Build all packages for production
	@echo "Building for production..."
	npm run build
	@echo "Build complete - files in $(PKG_DIR)/dist"

build-types: ## Emit TypeScript declarations (tsc)
	@echo "Building type declarations..."
	npm run build:types

package: build ## Create npm package tarball for $(PKG)
	@echo "Creating package..."
	npm pack -w $(PKG)
	@echo "Package created - see above for details"

publish-dry: ## Publish to npm (dry run) - cleans + builds first
	@echo "Running publish dry-run..."
	npm run clean -w $(PKG)
	npm run build -w $(PKG)
	npm publish -w $(PKG) --dry-run
	@echo "Dry-run complete - review the output above"

publish: ## Publish $(PKG) to npm as 'latest' - cleans + builds first
	@echo "WARNING: This will publish $(PKG) to the npm registry as the 'latest' dist-tag"
	@echo "Use 'make publish-rc' instead if you're shipping a pre-release version."
	@echo "Press Ctrl+C to cancel, or Enter to continue..."
	@powershell -Command "Read-Host | Out-Null"
	@echo "Publishing to npm..."
	npm run clean -w $(PKG)
	npm run build -w $(PKG)
	npm publish -w $(PKG)
	@echo "Published successfully"

publish-rc: ## Publish $(PKG) under the 'rc' dist-tag (does NOT touch 'latest')
	@echo "WARNING: This will publish $(PKG) under the 'rc' dist-tag"
	@echo "The 'latest' tag will be untouched - consumers must opt in with @rc or @<version>."
	@echo "Press Ctrl+C to cancel, or Enter to continue..."
	@powershell -Command "Read-Host | Out-Null"
	@echo "Publishing to npm under 'rc' tag..."
	npm run clean -w $(PKG)
	npm run build -w $(PKG)
	npm publish -w $(PKG) --tag rc
	@echo "Published successfully under 'rc' tag"

clean: ## Clean build artifacts (dist) across packages
	@echo "Cleaning build artifacts..."
	npm run clean
	@echo "Clean complete"

clean-dist: ## Clean only the $(PKG) dist folder
	@echo "Cleaning dist folder..."
	npm run clean -w $(PKG)
	@echo "Dist cleaned"

preview: build ## Preview the production build
	@echo "Starting preview server..."
	npm run preview -w $(PKG)

lint: ## Run linter (if configured)
	@echo "Linting is not configured yet (planned for Phase 6)"
	@echo "Consider adding ESLint, mirroring the rest of the component line"

test: ## Run unit tests (Vitest)
	npm test

test-watch: ## Run unit tests in watch mode
	npm run test:unit:watch -w $(PKG)

test-e2e: ## Run Playwright e2e tests (headless)
	@echo "e2e tests are not configured yet (planned for Phase 6)"

test-e2e-ui: ## Run Playwright e2e tests in UI mode
	@echo "e2e tests are not configured yet (planned for Phase 6)"

test-e2e-headed: ## Run Playwright e2e tests headed (watch the browser)
	@echo "e2e tests are not configured yet (planned for Phase 6)"

test-e2e-install: ## Install chromium browser binary (one-time)
	@echo "e2e tests are not configured yet (planned for Phase 6)"

check-version: ## Show current package version
	@echo "Current $(PKG) version:"
	@node -p "require('./$(PKG_DIR)/package.json').version"

update-deps: ## Update dependencies
	@echo "Updating dependencies..."
	npm update
	@echo "Dependencies updated"

# ── Container image (examples site) ──────────────────────────────────────────
# Runner is configurable via .makefile.env (DOCKER_RUNNER); defaults to podman.
# NOTE: the Dockerfile + examples site land in Phase 6; these targets are wired
# ahead of that for convention parity with the rest of the component line.

image-build: ## Build the examples container image (build + serve stages)
	@echo "Building $(IMAGE_NAME) with $(DOCKER_RUNNER)..."
	$(DOCKER_RUNNER) build -t $(IMAGE_NAME) .
	@echo "Image built: $(IMAGE_NAME)"

image-run: ## Run the examples image (serves on IMAGE_PORT, default 12410)
	@echo "Starting $(CONTAINER_NAME) on http://localhost:$(IMAGE_PORT) ..."
	-@$(DOCKER_RUNNER) rm -f $(CONTAINER_NAME) >/dev/null 2>&1
	$(DOCKER_RUNNER) run -d --name $(CONTAINER_NAME) -p $(IMAGE_PORT):80 $(IMAGE_NAME)
	@echo "Serving examples at http://localhost:$(IMAGE_PORT)"

image-stop: ## Stop and remove the examples container
	@echo "Stopping $(CONTAINER_NAME)..."
	-@$(DOCKER_RUNNER) rm -f $(CONTAINER_NAME) >/dev/null 2>&1
	@echo "Stopped"

image-clean: image-stop ## Remove the examples container and image
	@echo "Removing image $(IMAGE_NAME)..."
	-@$(DOCKER_RUNNER) rmi $(IMAGE_NAME) >/dev/null 2>&1
	@echo "Image removed"

# Default target
.DEFAULT_GOAL := help
