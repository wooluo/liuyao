#!/bin/bash
# 六爻金钱卦 · 一键重建安卓 APK（同步前端 + Gradle 构建）
set -e
cd "$(dirname "$0")"
export JAVA_HOME="$PWD/../tools/amazon-corretto-21.jdk/Contents/Home"
export ANDROID_HOME="$PWD/../tools/android-sdk"
if [ ! -d "$ANDROID_HOME" ]; then echo "缺少 Android SDK（tools/android-sdk），参见 README"; exit 1; fi
mkdir -p www && cp -R ../static/* www/
npm install --no-audit --no-fund
npx cap sync android
(cd android && ./gradlew assembleDebug)
cp android/app/build/outputs/apk/debug/app-debug.apk ./六爻金钱卦-debug.apk
echo "构建完成：$(pwd)/六爻金钱卦-debug.apk"
