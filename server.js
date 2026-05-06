const http = require('http');
const https = require('https');
const url = require('url');
const path = require('path');
const fs = require('fs');

// ========== 环境变量加载 ==========
function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        content.split('\n').forEach(line => {
            line = line.trim();
            if (line && !line.startsWith('#')) {
                const [key, ...values] = line.split('=');
                if (key && values.length > 0) {
                    process.env[key.trim()] = values.join('=').trim();
                }
            }
        });
    }
}
loadEnv();

// ========== 配置（从环境变量读取） ==========
const PORT = process.env.PORT || 3000;
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
const MINIMAX_API_HOST = process.env.MINIMAX_API_HOST || 'api.minimaxi.com';

// 创建输出目录
const audioDir = path.join(__dirname, 'public', 'audio');
const imageDir = path.join(__dirname, 'public', 'images');
if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });

// ========== SQLite 数据库初始化 ==========
const Database = require('better-sqlite3');
const dbPath = path.join(__dirname, 'data', 'records.db');
if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('encoding = "UTF-8"');

// 创建生成记录表
db.exec(`
    CREATE TABLE IF NOT EXISTS generation_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        prompt TEXT,
        parameters TEXT,
        result_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// 插入记录
function insertRecord(type, prompt, parameters, resultPath) {
    const stmt = db.prepare('INSERT INTO generation_records (type, prompt, parameters, result_path) VALUES (?, ?, ?, ?)');
    return stmt.run(type, prompt, JSON.stringify(parameters), resultPath);
}

// 查询所有记录（支持分页和时间筛选）
function getAllRecords(options) {
    const { type, limit = 10, offset = 0, startDate, endDate } = options;
    let sql = 'SELECT * FROM generation_records WHERE 1=1';
    const params = [];

    if (type) { sql += ' AND type = ?'; params.push(type); }
    if (startDate) { sql += ' AND created_at >= ?'; params.push(startDate); }
    if (endDate) { sql += ' AND created_at <= ?'; params.push(endDate); }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = db.prepare(sql);
    return stmt.all(...params);
}

// 查询记录总数
function getRecordsCount(options) {
    const { type, startDate, endDate } = options;
    let sql = 'SELECT COUNT(*) as total FROM generation_records WHERE 1=1';
    const params = [];

    if (type) { sql += ' AND type = ?'; params.push(type); }
    if (startDate) { sql += ' AND created_at >= ?'; params.push(startDate); }
    if (endDate) { sql += ' AND created_at <= ?'; params.push(endDate); }

    const stmt = db.prepare(sql);
    return stmt.get(...params).total;
}

// 查询单条记录
function getRecordById(id) {
    const stmt = db.prepare('SELECT * FROM generation_records WHERE id = ?');
    return stmt.get(id);
}

// 删除记录
function deleteRecord(id) {
    const stmt = db.prepare('DELETE FROM generation_records WHERE id = ?');
    return stmt.run(id);
}

// 解析请求体
function getRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(body ? JSON.parse(body) : {}); }
            catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}

// 转发请求到MiniMax API
function forwardToMinimax(method, apiPath, body) {
    return new Promise((resolve, reject) => {
        if (!MINIMAX_API_KEY) {
            reject(new Error('未配置 MINIMAX_API_KEY，请检查 .env 文件'));
            return;
        }

        const options = {
            hostname: MINIMAX_API_HOST,
            port: 443,
            path: apiPath,
            method: method,
            headers: {
                'Authorization': `Bearer ${MINIMAX_API_KEY}`,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { resolve(data); }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// 读取文件
function serveStaticFile(res, filePath, contentType) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
}

// 下载远程文件
function downloadFile(fileUrl, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(fileUrl, (response) => {
            if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(destPath);
                });
            } else {
                reject(new Error(`下载失败: ${response.statusCode}`));
            }
        }).on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
        });
    });
}

// 处理API请求
async function handleApiRequest(req, res, pathname, parsedUrl) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    try {
        const body = await getRequestBody(req);

        // ========== TTS 语音合成 ==========
        if (pathname === '/api/tts') {
            const resp = await forwardToMinimax('POST', '/v1/t2a_v2', {
                model: body.model || 'speech-2.8-hd',
                text: body.text,
                stream: false,
                voice_setting: {
                    voice_id: body.voice_id || 'Chinese_playful_streamer_vv1',
                    speed: body.speed || 1.2,
                    vol: body.vol || 1,
                    pitch: body.pitch || 0
                },
                audio_setting: {
                    sample_rate: body.sample_rate || 32000,
                    bitrate: body.bitrate || 128000,
                    format: 'mp3',
                    channel: body.channel || 1
                },
                output_format: 'hex'
            });

            if (resp.data?.audio) {
                const audioBuffer = Buffer.from(resp.data.audio, 'hex');
                const filename = `tts_${Date.now()}.mp3`;
                const filepath = path.join(audioDir, filename);
                fs.writeFileSync(filepath, audioBuffer);

                // 保存记录
                insertRecord('tts', body.text, {
                    voice_id: body.voice_id,
                    model: body.model,
                    speed: body.speed,
                    pitch: body.pitch,
                    vol: body.vol
                }, `/audio/${filename}`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, audioUrl: `/audio/${filename}` }));
            } else {
                throw new Error(resp.emsg || 'TTS API 返回无效数据');
            }
            return;
        }

        // ========== 图片生成 ==========
        if (pathname === '/api/image') {
            // 构建图片生成的请求参数
            const imageRequest = {
                model: 'image-01',
                prompt: body.prompt
            };

            // 可选参数
            if (body.size) imageRequest.size = body.size;
            if (body.num) imageRequest.num = body.num;
            if (body.style) imageRequest.style = body.style;
            // image-01 模型可能不支持 quality/light 参数，仅在明确传入时才添加
            if (body.quality && body.quality !== 'standard') imageRequest.quality = body.quality;
            if (body.negative_prompt) imageRequest.negative_prompt = body.negative_prompt;

            const resp = await forwardToMinimax('POST', '/v1/image_generation', imageRequest);
            console.log('图片API响应:', JSON.stringify(resp).slice(0, 500));

            if (resp.code === 0 || resp.data) {
                // API返回的是 image_urls，不是 images
                const imageUrls = resp.data?.image_urls || resp.data?.images || [];
                console.log('图片URLs:', imageUrls);

                if (imageUrls.length > 0) {
                    // 下载图片到本地
                    const localImages = [];
                    for (let i = 0; i < imageUrls.length; i++) {
                        const imgUrl = imageUrls[i];
                        const ext = imgUrl.includes('.png') ? 'png' : 'jpg';
                        const filename = `img_${Date.now()}_${i}.${ext}`;
                        const filepath = path.join(imageDir, filename);

                        try {
                            await downloadFile(imgUrl, filepath);
                            localImages.push(`/images/${filename}`);
                        } catch (e) {
                            console.error('下载图片失败:', e);
                            // 如果下载失败，使用原始URL
                            localImages.push(imgUrl);
                        }
                    }

                    // 保存记录（只记录第一张图片）
                    if (localImages.length > 0) {
                        insertRecord('image', body.prompt, {
                            size: body.size,
                            num: body.num,
                            style: body.style,
                            quality: body.quality
                        }, localImages[0]);
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, images: localImages }));
                } else {
                    throw new Error('未返回图片数据');
                }
            } else {
                throw new Error(resp.emsg || '图片生成API错误');
            }
            return;
        }

        // ========== 音乐生成 ==========
        if (pathname === '/api/music') {
            // 构建音乐生成的请求参数
            const musicRequest = {
                model: body.model || 'music-2.6',
                prompt: body.prompt
            };

            // 添加歌词（至少需要一个）
            if (body.lyrics) {
                musicRequest.lyrics = body.lyrics;
            } else if (body.lyrics_optimizer) {
                musicRequest.lyrics_optimizer = true;
            } else {
                // 默认启用歌词优化器
                musicRequest.lyrics_optimizer = true;
            }
            if (body.instrumental) musicRequest.instrumental = true;

            // 其他可选参数
            if (body.vocals) musicRequest.vocals = body.vocals;
            if (body.genre) musicRequest.genre = body.genre;
            if (body.mood) musicRequest.mood = body.mood;
            if (body.tempo) musicRequest.tempo = body.tempo;
            if (body.bpm) musicRequest.bpm = body.bpm;
            if (body.key) musicRequest.key = body.key;
            if (body.structure) musicRequest.structure = body.structure;
            if (body.instruments) musicRequest.instruments = body.instruments;
            if (body.avoid) musicRequest.avoid = body.avoid;
            if (body.extra) musicRequest.extra = body.extra;

            console.log('音乐生成请求:', JSON.stringify(musicRequest, null, 2));
            const resp = await forwardToMinimax('POST', '/v1/music_generation', musicRequest);
            console.log('音乐生成响应:', JSON.stringify(resp, null, 2));

            if (resp.code === 0 || resp.data) {
                // 获取音频URL或hex数据
                let audioUrl = resp.data?.audio_url || resp.data?.music_url || '';
                let audioHex = resp.data?.audio || '';

                // 如果有hex数据，保存到文件
                if (audioHex && !audioUrl) {
                    try {
                        const audioBuffer = Buffer.from(audioHex, 'hex');
                        const filename = `music_${Date.now()}.mp3`;
                        const filepath = path.join(audioDir, filename);
                        fs.writeFileSync(filepath, audioBuffer);
                        audioUrl = `/audio/${filename}`;
                        audioHex = '';
                    } catch (e) {
                        console.error('保存音乐文件失败:', e);
                    }
                } else if (audioUrl) {
                    // 如果有URL，下载到本地
                    const ext = audioUrl.includes('.wav') ? 'wav' : 'mp3';
                    const filename = `music_${Date.now()}.${ext}`;
                    const filepath = path.join(audioDir, filename);

                    try {
                        await downloadFile(audioUrl, filepath);
                        audioUrl = `/audio/${filename}`;
                    } catch (e) {
                        console.error('下载音乐失败:', e);
                    }
                }

                // 保存记录
                if (audioUrl) {
                    insertRecord('music', body.prompt, {
                        model: body.model,
                        lyrics: body.lyrics,
                        lyrics_optimizer: body.lyrics_optimizer,
                        instrumental: body.instrumental
                    }, audioUrl);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    musicUrl: audioUrl,
                    audioHex: audioHex,
                    taskId: resp.data?.task_id || ''
                }));
            } else {
                throw new Error(resp.emsg || resp.error?.message || '音乐生成API错误');
            }
            return;
        }

        // ========== 音乐生成状态查询 ==========
        if (pathname.match(/^\/api\/music\/status\/([^/]+)$/) && req.method === 'GET') {
            const taskId = pathname.match(/^\/api\/music\/status\/([^/]+)$/)[1];
            const resp = await forwardToMinimax('GET', `/v1/music_generation?task_id=${taskId}`, null);

            if (resp.code === 0 || resp.data) {
                let audioUrl = resp.data?.audio_url || resp.data?.music_url || '';
                let status = resp.data?.status || 'pending';

                if (audioUrl && status === 'success') {
                    const ext = audioUrl.includes('.wav') ? 'wav' : 'mp3';
                    const filename = `music_${Date.now()}.${ext}`;
                    const filepath = path.join(audioDir, filename);
                    try {
                        await downloadFile(audioUrl, filepath);
                        audioUrl = `/audio/${filename}`;
                    } catch (e) {
                        console.error('下载音乐失败:', e);
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    status: status,
                    musicUrl: audioUrl
                }));
            } else {
                throw new Error(resp.emsg || '查询失败');
            }
            return;
        }

        // ========== 歌词生成 ==========
        if (pathname === '/api/lyric') {
            // 使用文本生成API创建歌词
            const style = body.style || '';
            const theme = body.theme || '一首歌曲';
            const type = body.type || '自动';
            const length = body.length || 'medium';

            const lyricPrompt = `请为"${theme}"创作歌词。
风格要求：${style || '自由风格'}
类型：${type || '自动'}
长度：${length}

请使用以下结构标签来组织歌词（不要在标签内加描述文字）：
[Intro] - 前奏
[Verse] - 主歌
[Pre Chorus] - 预副歌
[Chorus] - 副歌
[Bridge] - 桥段
[Outro] - 尾奏

只输出歌词内容，不要其他解释。`;

            const resp = await forwardToMinimax('POST', '/v1/text/chatcompletion_v2', {
                model: 'MiniMax-M2.7',
                messages: [
                    { role: 'user', content: lyricPrompt }
                ]
            });

            if (resp.choices && resp.choices[0]?.message?.content) {
                const lyricText = resp.choices[0].message.content;

                // 保存记录
                insertRecord('lyric', lyricPrompt, {
                    theme: body.theme,
                    style: body.style,
                    type: body.type,
                    length: body.length
                }, null);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    lyric: lyricText
                }));
            } else {
                throw new Error(resp.base_resp?.status_msg || resp.error?.message || '歌词生成API错误');
            }
            return;
        }

        // ========== AI 对话助手 ==========
        if (pathname === '/api/chat') {
            const messages = body.messages || [];

            // 系统提示词（提示词优化助手）
            const systemPrompt = `你是一个专业的AI创作提示词工程师，精通：
- 图片生成提示词（prompt）的写作技巧
- 音乐描述prompt的结构和要素
- TTS语音合成的文本优化
- 歌词风格的表达方法

用户会向你咨询如何写出更好的提示词，你应该：
1. 理解用户的创作需求
2. 提供具体的提示词建议
3. 解释为什么这样写更有效
4. 给出可改进的示例对比

使用中文回答，保持专业且友好的风格。`;

            const resp = await forwardToMinimax('POST', '/v1/text/chatcompletion_v2', {
                model: 'MiniMax-M2.7',
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...messages
                ]
            });

            if (resp.choices && resp.choices[0]?.message?.content) {
                const reply = resp.choices[0].message.content;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, reply }));
            } else {
                throw new Error(resp.base_resp?.status_msg || resp.error?.message || '对话API错误');
            }
            return;
        }

        // ========== 生成记录 CRUD ==========
        if (pathname === '/api/records' && req.method === 'GET') {
            const type = parsedUrl.query.type;
            const limit = parseInt(parsedUrl.query.limit) || 10;
            const offset = parseInt(parsedUrl.query.offset) || 0;
            const startDate = parsedUrl.query.startDate || null;
            const endDate = parsedUrl.query.endDate || null;

            const records = getAllRecords({ type, limit, offset, startDate, endDate });
            const total = getRecordsCount({ type, startDate, endDate });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, records, total }));
            return;
        }

        if (pathname === '/api/records' && req.method === 'POST') {
            const { type, prompt, parameters, result_path } = await getRequestBody(req);
            if (!type || !result_path) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'type和result_path是必填项' }));
                return;
            }
            const result = insertRecord(type, prompt, parameters, result_path);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, id: result.lastInsertRowid }));
            return;
        }

        if (pathname.match(/^\/api\/records\/(\d+)$/) && req.method === 'GET') {
            const id = parseInt(pathname.match(/^\/api\/records\/(\d+)$/)[1]);
            const record = getRecordById(id);
            if (record) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, record }));
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: '记录不存在' }));
            }
            return;
        }

        if (pathname.match(/^\/api\/records\/(\d+)$/) && req.method === 'DELETE') {
            const id = parseInt(pathname.match(/^\/api\/records\/(\d+)$/)[1]);
            const record = getRecordById(id);
            if (!record) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: '记录不存在' }));
                return;
            }
            // 删除文件
            if (record.result_path) {
                const filePath = path.join(__dirname, 'public', record.result_path);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }
            deleteRecord(id);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
        }

        // 404
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));

    } catch (error) {
        console.error('API Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
    }
}

// 创建HTTP服务器
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // CORS预检
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.writeHead(200);
        res.end();
        return;
    }

    // API路由
    if (pathname.startsWith('/api/')) {
        await handleApiRequest(req, res, pathname, parsedUrl);
        return;
    }

    // 静态文件
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = path.join(__dirname, 'public', filePath);

    const ext = path.extname(filePath);
    const contentTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.mp3': 'audio/mpeg',
        '.mp4': 'video/mp4'
    };

    const contentType = contentTypes[ext] || 'text/plain';
    serveStaticFile(res, filePath, contentType);
});

server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║       MiniMax AI 创作工坊                       ║
╠═══════════════════════════════════════════════╣
║  本地访问: http://localhost:${PORT}              ║
║  已启动，请访问 http://localhost:${PORT}         ║
╚═══════════════════════════════════════════════╝
    `);
});