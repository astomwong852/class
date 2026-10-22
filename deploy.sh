#!/usr/bin/env bash
# 一鍵部署課堂網頁上 GitHub Pages
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
  echo "-- 冇改動，唔使 push"
else
  git commit -q -m "$MSG"
  git push -q origin HEAD
  echo "✅ 已推送：$MSG"
fi

echo "-- Pages 網址：$(git remote get-url origin | sed -E 's#.*github\.com[:/]([^/]+)/([^/.]+).*#https://\1.github.io/\2/#')"
echo "-- 約 30-60 秒後生效（瀏覽器強制刷新 Ctrl+Shift+R）"
