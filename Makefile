# Proxy dashboard: Rust proxy + React UI
# Usage: make help

.DEFAULT_GOAL := help

.PHONY: help install build dev backend frontend run clean electron-dev electron-build electron-build-mac electron-build-win electron-build-linux

help:
	@echo "Targets:"
	@echo "  make install   – bun install (frontend + desktop) + fetch Rust deps"
	@echo "  make build     – release Rust binary + Vite production bundle"
	@echo "  make dev       – watch backend and auto-restart proxy server on code changes"
	@echo "  make backend   – only \`cargo run -p proxy-app\` (proxy + API on 9090/9091)"
	@echo "  make frontend  – only \`bun run dev\` in frontend/ (dashboard port: env DASHBOARD_PORT or frontend/.proxy-dev-ports.json)"
	@echo "  make run       – build UI then run Rust; open http://127.0.0.1:9091"
	@echo "  make clean     – cargo clean + remove frontend/dist"
	@echo "  make electron-dev  – Electron + Vite + proxy (cd desktop/ && bun install first)"
	@echo "  make electron-build – Electron production bundles (from desktop/, per host target)"
	@echo "  make electron-build-mac – Electron macOS production bundle"
	@echo "  make electron-build-win – Electron Windows production bundle"
	@echo "  make electron-build-linux – Electron Linux production bundle"
	@echo ""
	@echo "Env: PROXY_PORT=9090 DASHBOARD_PORT=9091 MITM=1 UPSTREAM_HTTP3=1"

install:
	cd frontend && bun install
	cd desktop && bun install
	cargo fetch

build:
	cd frontend && bun run build
	cargo build --release -p proxy-app

dev:
	MITM=1 PROXY_AUTO_SYSTEM_PROXY=1 cargo watch -w backend/src -w backend/Cargo.toml -x "run -p proxy-app"

backend:
	MITM=1 PROXY_AUTO_SYSTEM_PROXY=1 cargo run -p proxy-app

frontend:
	cd frontend && bun run dev

run: build
	PROXY_AUTO_SYSTEM_PROXY=1 cargo run --release -p proxy-app

clean:
	cargo clean
	rm -rf frontend/dist

electron-dev:
	cd desktop && bun run electron:dev

electron-build:
	cd desktop && bun run electron:build

electron-build-mac:
	cd desktop && bun run electron:build:mac

electron-build-win:
	cd desktop && bun run electron:build:win

electron-build-linux:
	cd desktop && bun run electron:build:linux
