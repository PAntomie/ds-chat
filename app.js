const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const marked = require('marked');
require('dotenv').config();

const app = express();
const HISTORY_FILE = path.join(__dirname, 'history.json');
let messageId = 1;
let chatHistory = [];

// 初始化历史记录
async function initializeHistory() {
    try {
        const data = await fs.readFile(HISTORY_FILE, 'utf-8');
        chatHistory = JSON.parse(data);
        messageId = Math.max(...chatHistory.map(m => m.id), 0) + 1;
    } catch {
        chatHistory = [
            {
                id: 0,
                role: 'system',
                content: '输出markdown'
            }
        ];
    }
}

const HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>AI Chat</title>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    body { 
        max-width: 800px; 
        margin: 0 auto; 
        padding: 20px; 
        font-family: 'Segoe UI', Arial, sans-serif;
        background-color: #f5f5f5;
    }
    .message { 
        margin: 10px 0; 
        padding: 15px; 
        border-radius: 8px; 
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        transition: transform 0.1s ease;
        position: relative;
    }
    .message:hover {
        transform: translateX(5px);
    }
    .system { background: #e8f4fc; }
    .user { background: #d1e7dd; }
    .assistant { background: #fff3cd; }
    #messages { 
        height: 60vh; 
        overflow-y: auto; 
        border: 1px solid #ddd; 
        padding: 15px; 
        border-radius: 8px;
        background-color: white;
        margin-bottom: 20px;
    }
    #input-area {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
    }
    select, button {
        padding: 10px 15px;
        border: none;
        border-radius: 5px;
        background-color: #007bff;
        color: white;
        cursor: pointer;
        transition: background-color 0.2s;
        height: 40px;
    }
    select:hover, button:hover {
        background-color: #0056b3;
    }
    select {
        background-color: #6c757d;
        min-width: 100px;
    }
    textarea {
        flex: 1;
        min-height: 100px;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 5px;
        font-family: inherit;
        font-size: 14px;
        resize: vertical;
    }
    #clear-btn {
        background-color: #dc3545;
    }
    #clear-btn:hover {
        background-color: #c82333;
    }
    .edit-btn {
        background-color: #ffc107;
        color: black;
        position: absolute;
        right: 10px;
        top: 10px;
    }
    .edit-btn:hover {
        background-color: #e0a800;
    }
    small {
        display: block;
        margin-bottom: 5px;
        color: #666;
        font-weight: bold;
    }
    .loading {
        display: none;
        color: #666;
        font-style: italic;
    }
  </style>
</head>
<body>
  <div id="messages"></div>
  <div id="input-area">
    <select id="role">
      <option value="user">User</option>
      <option value="system">System</option>
      <option value="assistant">assistant</option>>
    </select>
    <textarea id="input" placeholder="输入消息..." rows="3"></textarea>
    <button onclick="sendMessage()">发送</button>
    <button onclick="clearHistory()" id="clear-btn">清空</button>
  </div>
  <div class="loading" id="loading">发送中...</div>

  <script>
    marked.setOptions({
      sanitize: true,
      breaks: true
    });

    let editingId = null;

    async function loadHistory() {
      const res = await fetch('/api/history');
      const messages = await res.json();
      renderMessages(messages);
    }

    function renderMessages(messages) {
      const container = document.getElementById('messages');
      container.innerHTML = messages.map(msg => \`
        <div class="message \${msg.role}" id="msg-\${msg.id}">
          <small>\${msg.role.toUpperCase()}:</small>
          <div>\${marked.parse(msg.content)}</div>
          <button class="edit-btn" onclick="editMessage(\${msg.id})">编辑</button>
        </div>
      \`).join('');
      container.scrollTop = container.scrollHeight;
    }

    async function sendMessage() {
      const input = document.getElementById('input');
      const role = document.getElementById('role').value;
      const content = input.value.trim();
      
      if (!content) return;

      const loading = document.getElementById('loading');
      loading.style.display = 'block';

      try {
        if (editingId !== null) {
          await fetch(\`/api/messages/\${editingId}\`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role, content })
          });
          editingId = null;
        } else {
          await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role, content })
          });
        }

        input.value = '';
        
        if (role === 'user' && editingId === null) {
          await fetch('/api/chat', { method: 'POST' });
        }

        await loadHistory();
      } catch (error) {
        alert(error.message);
      } finally {
        loading.style.display = 'none';
      }
    }

    async function editMessage(id) {
      try {
        console.log('正在尝试编辑消息ID:', id);
        const res = await fetch(\`/api/messages/\${id}\`);
        if (!res.ok) throw new Error('获取消息失败');
        
        const msg = await res.json();
        document.getElementById('input').value = msg.content;
        document.getElementById('role').value = msg.role;
        editingId = id;
        
        // 可视化反馈
        const msgElement = document.getElementById(\`msg-\${id}\`);
        msgElement.style.transform = 'scale(1.02)';
        setTimeout(() => msgElement.style.transform = '', 200);
        
        // 滚动到输入区域
        document.getElementById('input').scrollIntoView({ behavior: 'smooth' });
      } catch (error) {
        alert(error.message);
        console.error('编辑错误:', error);
      }
    }

    async function clearHistory() {
      if (confirm('确定要清空对话记录吗？')) {
        await fetch('/api/history', { method: 'DELETE' });
        await loadHistory();
      }
    }

    loadHistory();
  </script>
</body>
</html>
`;

// API端点
app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

app.get('/', (req, res) => {
    res.send(HTML);
});

// 消息相关接口
app.get('/api/history', (req, res) => {
    res.json(chatHistory);
});

app.get('/api/messages/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const msg = chatHistory.find(m => m.id === id);
        if (!msg) return res.status(404).json({ error: 'Message not found' });
        res.json(msg);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/messages', async (req, res) => {
    try {
        const { role, content } = req.body;
        const newMsg = { id: messageId++, role, content };
        chatHistory.push(newMsg);
        await fs.writeFile(HISTORY_FILE, JSON.stringify(chatHistory, null, 2));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/messages/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const msg = chatHistory.find(m => m.id === id);
        if (!msg) return res.status(404).json({ error: 'Message not found' });

        msg.role = req.body.role;
        msg.content = req.body.content;
        await fs.writeFile(HISTORY_FILE, JSON.stringify(chatHistory, null, 2));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/history', async (req, res) => {
    try {
        chatHistory = [];
        messageId = 1;
        await fs.unlink(HISTORY_FILE).catch(() => {});
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 聊天处理接口
app.post('/api/chat', async (req, res) => {
    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: chatHistory.map(m => ({
                    role: m.role,
                    content: m.content
                })),
                temperature: 0.7
            })
        });

        const data = await response.json();
        const assistantMsg = data.choices[0].message.content;

        chatHistory.push({
            id: messageId++,
            role: 'assistant',
            content: assistantMsg
        });

        await fs.writeFile(HISTORY_FILE, JSON.stringify(chatHistory, null, 2));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

async function startServer() {
    await initializeHistory();
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}

startServer();