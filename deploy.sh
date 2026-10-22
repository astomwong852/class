#!/usr/bin/env bash
# 一鍵部署課堂網頁：GitHub Pages（備份）＋ Cloudflare Pages（短網址主站）
# 用法：  ./deploy.sh "今次改咗咩"
set -e
cd "$(dirname "$0")"
MSG="${1:-update activities}"

export PATH="/c/Users/admin/bin/gh:$PATH"

if [ ! -d .git ]; then
  echo "!! 未初始化 git，請先設定 remote"
  exit 1
fi

git add -A
if git diff --cached --quiet; then
  echo "-- [GH] 冇改動"
else
  git commit -q -m "$MSG"
  git push -q origin HEAD
  echo "✅ [GH] 已推送：$MSG"
fi

# ---------- Cloudflare Pages（短網址主站） ----------
PROJECT="fk1ps-class"
rm -rf dist && mkdir -p dist
cp -f *.html _redirects dist/ 2>/dev/null || true
[ -d assets ] && cp -R assets dist/ || true

echo "-- [CF] 上載中…"
wrangler pages deploy dist --project-name "$PROJECT" --branch main --commit-dirty=true 2>&1 \
  | grep -E "Success|Deployment complete|error|Error" || true

echo ""
echo "=================================================="
echo " 短網址（主）：  https://${PROJECT}.pages.dev/"
echo " GitHub（備份）：https://astomwong852.github.io/class/"
echo " 生效：Cloudflare 幾秒 · GitHub 30-60 秒"
echo "=================================================="
