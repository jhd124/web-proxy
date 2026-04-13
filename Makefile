# Proxy dashboard: Rust proxy + React UI
# Usage: make help

.DEFAULT_GOAL := help

.PHONY: help install build dev backend frontend run clean

help:
	@echo "Targets:"
	@echo "  make install   – npm install (frontend) + fetch Rust deps"
	@echo "  make build     – release Rust binary + Vite production bundle"
	@echo "  make dev       – proxy + dashboard API (8080/3001) and Vite (5173) together"
	@echo "  make backend   – only \`cargo run --release\` (proxy + API on 8080/3001)"
	@echo "  make frontend  – only \`npm run dev\` in frontend/ (proxies to 3001)"
	@echo "  make run       – build UI then run Rust; open http://127.0.0.1:3001"
	@echo "  make clean     – cargo clean + remove frontend/dist"
	@echo ""
	@echo "Env: PROXY_PORT=8080 DASHBOARD_PORT=3001 MITM=1 UPSTREAM_HTTP3=1"

install:
	cd frontend && npm install
	cargo fetch

build:
	cd frontend && npm run build
	cargo build --release

# Run backend and Vite in parallel (output may interleave).
dev:
	$(MAKE) -j2 backend frontend

backend:
	MITM=1 cargo run

frontend:
	cd frontend && npm run dev

run: build
	cargo run --release

clean:
	cargo clean
	rm -rf frontend/dist
