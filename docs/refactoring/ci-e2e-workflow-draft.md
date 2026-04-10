# CI E2E Workflow Draft（參考用）

> **狀態**：僅供未來參考，尚未實作。本機跑綠即可，有遠端環境需求時再補。
>
> 此文件記錄 GitHub Actions 執行 E2E 測試的設定草稿，作為未來 CI 整合的起點。

## GitHub Actions Workflow

```yaml
# .github/workflows/e2e.yml（草稿，尚未啟用）
name: E2E Tests

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

# 同一 PR 的新 push 取消進行中的 run
concurrency:
  group: e2e-${{ github.ref }}
  cancel-in-progress: true

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      # Playwright browser binary cache
      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}

      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps chromium

      # mongodb-memory-server binary cache
      - name: Cache mongod binary
        uses: actions/cache@v4
        with:
          path: ~/.cache/mongodb-binaries
          key: mongod-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}

      - name: Run E2E tests
        run: pnpm test:e2e
        env:
          CI: true

      # 失敗時上傳 trace + screenshot
      - name: Upload test artifacts
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-artifacts
          path: |
            test-results/
            playwright-report/
          retention-days: 7
```

## 設計考量

### 為何單一 job

- `workers: 1`，E2E 測試共享 in-memory DB，不能平行化
- 不需要 matrix（只跑 chromium）
- 整套 ~5 分鐘內跑完，不值得拆分

### Cache 策略

1. **pnpm store**：`setup-node` 的 `cache: pnpm` 自動處理
2. **Playwright browsers**：`~/.cache/ms-playwright`，key 綁定 lockfile hash
3. **mongod binary**：`~/.cache/mongodb-binaries`，mongodb-memory-server 自動下載

### 超時設定

- Job level：30 分鐘（含 build + test）
- Playwright config：test timeout 60s、webServer 啟動 180s
- CI `retries: 2`（見 `playwright.config.ts`）

### 失敗除錯

- `trace: 'on-first-retry'`：只在 retry 時錄製 trace，減少 artifact 大小
- `screenshot: 'only-on-failure'`：失敗時自動截圖
- Artifact 保留 7 天

### 未來擴展

- **Scheduled run**：每日 main branch 跑一次，捕捉依賴更新造成的破壞
- **PR comment**：使用 `playwright-report` action 在 PR 上留失敗摘要
- **Sharding**：如果 test 量增加到 >15 分鐘，可考慮 `--shard` 分割

## 啟用步驟

1. 將上方 YAML 存為 `.github/workflows/e2e.yml`
2. 確認 `pnpm-lock.yaml` 已 commit
3. 確認 GitHub Actions 已啟用（repo Settings → Actions → General）
4. Push 一個 PR 驗證 pipeline
