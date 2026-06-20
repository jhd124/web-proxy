# Proxy dashboard: Rust proxy + React UI
# Usage: make help

.DEFAULT_GOAL := help

.PHONY: help install build dev backend frontend run clean tauri-dev tauri-build

help:
	@echo "Targets:"
	@echo "  make install   – npm install (frontend) + fetch Rust deps"
	@echo "  make build     – release Rust binary + Vite production bundle"
	@echo "  make dev       – watch backend and auto-restart proxy server on code changes"
	@echo "  make backend   – only \`cargo run -p proxy-app\` (proxy + API on 9090/9091)"
	@echo "  make frontend  – only \`npm run dev\` in frontend/ (dashboard port: env DASHBOARD_PORT or frontend/.proxy-dev-ports.json)"
	@echo "  make run       – build UI then run Rust; open http://127.0.0.1:9091"
	@echo "  make clean     – cargo clean + remove frontend/dist"
	@echo "  make tauri-dev  – Tauri 2 + Vite + proxy (cd desktop/ && npm install first)"
	@echo "  make tauri-build – Tauri production bundle (from desktop/, per host target)"
	@echo ""
	@echo "Env: PROXY_PORT=9090 DASHBOARD_PORT=9091 MITM=1 UPSTREAM_HTTP3=1"

install:
	cd frontend && npm install
	cargo fetch

build:
	cd frontend && npm run build
	cargo build --release -p proxy-app

dev:
	MITM=1 PROXY_AUTO_SYSTEM_PROXY=1 cargo watch -w backend/src -w backend/Cargo.toml -x "run -p proxy-app"

backend:
	MITM=1 PROXY_AUTO_SYSTEM_PROXY=1 cargo run -p proxy-app

frontend:
	cd frontend && npm run dev

run: build
	PROXY_AUTO_SYSTEM_PROXY=1 cargo run --release -p proxy-app

clean:
	cargo clean
	rm -rf frontend/dist

tauri-dev:
	cd desktop && npm run tauri:dev

tauri-build:
	cd desktop && npm run tauri:build
