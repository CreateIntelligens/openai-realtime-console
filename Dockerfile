# 使用 Node.js 20 LTS
FROM node:20-slim

# 安裝 openssl 以產生自簽憑證
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# 設定工作目錄
WORKDIR /app

# 暴露端口
EXPOSE 8908

# 啟動應用（透過 docker-compose 的 command 覆蓋）
CMD ["npm", "run", "dev"]
