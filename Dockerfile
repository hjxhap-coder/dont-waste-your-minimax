FROM node:18-alpine

LABEL maintainer="hjxhap-coder"

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --omit=dev

# 复制源码
COPY . .

# 创建必要的目录
RUN mkdir -p public/audio public/images data

# 暴露端口
EXPOSE 3000

# 启动服务
CMD ["node", "server.js"]
