# 别浪费你的 MiniMax！ / Don't Waste Your MiniMax!

[English](#english) | [中文](#中文)

---

## 中文

> 如果你开了 MiniMax 的 Token Plan，别浪费图片和语音额度，用这个工具消耗掉！

一个简洁好看的 MiniMax API 管理界面，支持语音合成、图片生成，音乐生成、歌词生成。

### 功能特性

- **语音合成 (TTS)** - 支持多种音色，语速/音调/音量可调
- **图片生成** - 多种尺寸和风格可选
- **音乐生成** - 支持自定义歌词和情绪标签
- **歌词生成** - AI 帮你写歌词
- **对话助手** - 帮你优化提示词
- **历史记录** - 自动保存，支持筛选和导出

### 快速部署

#### 方式一：Docker 一键部署（推荐）

```bash
# 1. 克隆项目
git clone https://github.com/hjxhap-coder/dont-waste-your-minimax.git
cd dont-waste-your-minimax

# 2. 复制环境变量文件
cp .env.example .env

# 3. 编辑 .env，填入你的 MiniMax API Key
# MINIMAX_API_KEY=your_api_key_here

# 4. 启动服务
docker-compose up -d
```

访问 http://localhost:3000 即可使用。

#### 方式二：本地运行

```bash
# 1. 克隆项目
git clone https://github.com/hjxhap-coder/dont-waste-your-minimax.git
cd dont-waste-your-minimax

# 2. 安装依赖
npm install

# 3. 复制环境变量文件
cp .env.example .env

# 4. 编辑 .env，填入你的 MiniMax API Key

# 5. 启动服务
npm start
```

### 环境变量配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MINIMAX_API_KEY` | MiniMax API Key | 必填 |
| `MINIMAX_API_HOST` | API 主机 | `api.minimaxi.com` |
| `PORT` | 服务端口 | `3000` |

### 技术栈

- **前端**: 原生 HTML/CSS/JavaScript，无框架依赖
- **后端**: Node.js 原生 HTTP 服务器
- **数据库**: SQLite（存储历史记录）
- **部署**: Docker / Docker Compose

### 项目结构

```
dont-waste-your-minimax/
├── public/
│   ├── index.html      # 前端页面
│   ├── audio/          # 生成的音频文件
│   └── images/         # 生成的图片文件
├── server.js           # 后端服务
├── package.json
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── .gitignore
```

### 免责声明

- 本项目仅供学习交流使用
- 请合理使用 MiniMax API，遵守其服务条款
- 生成的音频、图片等内容版权归生成者所有

---

## English

> Got a MiniMax Token Plan? Don't let your image and voice generation quotas go to waste — use this tool!

A clean and beautiful MiniMax API dashboard with support for text-to-speech, image generation, music generation, and lyrics writing.

### Features

- **Text-to-Speech (TTS)** - Multiple voice options, adjustable speed/pitch/volume
- **Image Generation** - Multiple aspect ratios and styles
- **Music Generation** - Custom lyrics and mood tags support
- **Lyrics Generation** - AI-powered lyrics writing
- **Chat Assistant** - Helps you optimize prompts
- **History** - Auto-save with filtering and export

### Quick Deploy

#### Option 1: Docker (Recommended)

```bash
# 1. Clone the repo
git clone https://github.com/hjxhap-coder/dont-waste-your-minimax.git
cd dont-waste-your-minimax

# 2. Copy environment file
cp .env.example .env

# 3. Edit .env and add your MiniMax API Key
# MINIMAX_API_KEY=your_api_key_here

# 4. Start services
docker-compose up -d
```

Visit http://localhost:3000 to use.

#### Option 2: Local Run

```bash
# 1. Clone the repo
git clone https://github.com/hjxhap-coder/dont-waste-your-minimax.git
cd dont-waste-your-minimax

# 2. Install dependencies
npm install

# 3. Copy environment file
cp .env.example .env

# 4. Edit .env with your MiniMax API Key

# 5. Start the server
npm start
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MINIMAX_API_KEY` | MiniMax API Key | Required |
| `MINIMAX_API_HOST` | API Host | `api.minimaxi.com` |
| `PORT` | Server Port | `3000` |

### Tech Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript, no framework
- **Backend**: Node.js native HTTP server
- **Database**: SQLite (history storage)
- **Deployment**: Docker / Docker Compose

### Project Structure

```
dont-waste-your-minimax/
├── public/
│   ├── index.html      # Frontend page
│   ├── audio/          # Generated audio files
│   └── images/         # Generated images
├── server.js           # Backend server
├── package.json
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── .gitignore
```

### Disclaimer

- This project is for learning and communication only
- Please use MiniMax API reasonably and follow their terms of service
- Generated content (audio, images, etc.) copyright belongs to the generator

---

## License / 许可证

MIT
