// ================= 全局变量定义 =================
let activeUtterance = null;
let wordList = [];
let currentWordIndex = 0;
let articleList = [];
let currentArticleText = "";
let articleSentences = [];
let currentSentenceIdx = 0;
let sentenceReplayTimer = null;
let currentChatMode = 'eng';
let chatHistory = [];

// ================= 1. 基础导航逻辑 =================
function switchTab(tabName) {
    document.querySelectorAll('.page-section').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('page-' + tabName).classList.add('active');
    document.getElementById('btn-' + tabName).classList.add('active');
}

// ================= 2. 数据加载核心 =================
async function loadAllData() {
    try {
        // 加载单词库 (NewWords.txt)
        const wRes = await fetch('NewWords.txt');
        if (wRes.ok) {
            const wText = await wRes.text();
            const rawLines = wText.split(/\r?\n/).map(w => w.trim()).filter(w => w.length > 0);
            wordList = [];
            for (let i = 0; i < rawLines.length; i += 2) {
                const wordLine = rawLines[i];
                const sentenceLine = (i + 1 < rawLines.length) ? rawLines[i+1] : "No example.";
                const parts = wordLine.split(/\||:|：/);
                wordList.push({ 
                    en: parts[0].trim(), 
                    zh: parts.length > 1 ? parts[1].trim() : "暂无中文", 
                    ex: sentenceLine 
                });
            }
            if (wordList.length > 0) {
                initGroupSelect(); // 这里就是你报错缺失的函数
                updateWordDisplay();
            }
        }

        // 加载文章库 (Texts.txt)
        const aRes = await fetch('Texts.txt');
        if (aRes.ok) {
            const aText = await aRes.text();
            const allLines = aText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            articleList = [];
            for (let i = 0; i < allLines.length; i += 2) {
                articleList.push({ en: allLines[i], zh: allLines[i+1] || "" });
            }
            if (articleList.length > 0) initArticleSelect();
        }
        
        updateDailyDashboard(); // 刷新看板
    } catch (e) {
        console.error("加载数据失败:", e);
    }
}

// ================= 3. 单词练习功能 (补全缺失函数) =================
function initGroupSelect() {
    const select = document.getElementById('groupSelect');
    select.innerHTML = `<option value="all">📚 整体练习 (共 ${wordList.length} 词)</option>`;
    const groupCount = Math.ceil(wordList.length / 10);
    for (let i = 0; i < groupCount; i++) {
        const start = i * 10 + 1;
        const end = Math.min((i + 1) * 10, wordList.length);
        let option = document.createElement('option');
        option.value = i;
        option.text = `📦 第 ${i + 1} 组 (词汇 ${start} - ${end})`;
        select.appendChild(option);
    }
}

function getGroupBounds() {
    const val = document.getElementById('groupSelect').value;
    if (val === 'all') return { start: 0, end: wordList.length - 1, total: wordList.length };
    const start = parseInt(val) * 10;
    return { start, end: Math.min(start + 9, wordList.length - 1), total: Math.min(start + 9, wordList.length - 1) - start + 1 };
}

function changeGroup() {
    currentWordIndex = getGroupBounds().start;
    updateWordDisplay();
}

function updateWordDisplay() {
    if (wordList.length === 0) return;
    const bounds = getGroupBounds();
    document.getElementById('targetWord').innerText = wordList[currentWordIndex].en;
    document.getElementById('wordCounter').innerText = `${currentWordIndex - bounds.start + 1} / ${bounds.total}`;
    document.getElementById('chineseMeaning').style.display = 'none';
    document.getElementById('chineseMeaning').innerText = wordList[currentWordIndex].zh;
    document.getElementById('exampleSentence').style.display = 'none';
    document.getElementById('exampleSentence').innerText = wordList[currentWordIndex].ex;
    document.getElementById('targetWord').style.filter = 'none';
}

function nextWord() {
    const bounds = getGroupBounds();
    currentWordIndex++;
    if (currentWordIndex > bounds.end) currentWordIndex = bounds.start;
    updateWordDisplay();
}

function toggleMeaning() {
    const el = document.getElementById('chineseMeaning');
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function readTargetWord() {
    window.speechSynthesis.cancel();
    activeUtterance = new SpeechSynthesisUtterance(wordList[currentWordIndex].en);
    activeUtterance.lang = 'en-US';
    window.speechSynthesis.speak(activeUtterance);
}

// ================= 4. 自动化看板逻辑 (方案一) =================
function markCurrentGroupFinished() {
    const val = document.getElementById('groupSelect').value;
    if (val === 'all') return alert("请先选择一个具体的组号。");
    const gNum = parseInt(val) + 1;
    const today = new Date().toISOString().split('T')[0];
    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    history[gNum] = today;
    localStorage.setItem('eng_study_history', JSON.stringify(history));
    alert(`第 ${gNum} 组已记录，复习计划已开启！`);
    updateDailyDashboard();
}

function updateDailyDashboard() {
    const taskList = document.getElementById('taskList');
    const todayObj = new Date();
    document.getElementById('todayDate').innerText = todayObj.toISOString().split('T')[0];
    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    let tasks = [];
    
    // 复习逻辑
    for (let gNum in history) {
        const diffDays = Math.ceil(Math.abs(todayObj - new Date(history[gNum])) / 86400000) - 1;
        if ([1, 3, 6].includes(diffDays)) {
            tasks.push(`🔄 需复习：<a href="#" onclick="jumpToGroup(${gNum-1})">第 ${gNum} 组</a> (${diffDays}天前完成)`);
        }
    }
    taskList.innerHTML = tasks.length > 0 ? tasks.join('<br>') : "✅ 今日暂无复习任务，开始新课吧！";
}

function jumpToGroup(idx) {
    document.getElementById('groupSelect').value = idx;
    changeGroup();
}

// ================= 5. AI 故事生成与同步 (方案三) =================
async function generateRevisionStory() {
    const apiKey = localStorage.getItem('silicon_api_key');
    if (!apiKey) return alert("请先设置 API Key");
    
    // 获取当前组单词
    const bounds = getGroupBounds();
    let words = [];
    for (let i = bounds.start; i <= bounds.end; i++) words.push(wordList[i].en);
    
    const btn = document.getElementById('btnGenStory');
    const contentBox = document.getElementById('aiStoryContent');
    btn.innerText = "⏳ AI 正在创作...";
    contentBox.style.display = 'block';
    contentBox.innerText = "正在串联单词...";

    const prompt = `Write a story with these words: [${words.join(", ")}]. Bold the words. Add Chinese translation at the end after '---'.`;

    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'Qwen/Qwen2.5-7B-Instruct', messages: [{role:"user", content: prompt}] })
        });
        const data = await res.json();
        const text = data.choices[0].message.content;
        contentBox.innerHTML = text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        document.getElementById('btnShadowStory').style.display = 'block';
        btn.innerText = "🪄 重新生成故事";
    } catch (e) { alert("AI 请求失败"); btn.innerText = "生成失败"; }
}

function transferStoryToArticle() {
    const text = document.getElementById('aiStoryContent').innerText;
    const parts = text.split('---');
    currentArticleText = parts[0].trim();
    switchTab('articles');
    document.getElementById('articleDisplay').innerHTML = `<b>AI复习文章：</b><br>${parts[0]}<br><hr><small>${parts[1]||""}</small>`;
}

// ================= 6. 文章跟读逻辑 =================
function initArticleSelect() {
    const startSel = document.getElementById('articleStartSelect');
    const endSel = document.getElementById('articleEndSelect');
    startSel.innerHTML = ''; endSel.innerHTML = '';
    articleList.forEach((_, i) => {
        startSel.add(new Option(`第 ${i+1} 段`, i));
        endSel.add(new Option(`第 ${i+1} 段`, i));
    });
    changeArticleRange();
}

function changeArticleRange() {
    const start = parseInt(document.getElementById('articleStartSelect').value);
    const end = parseInt(document.getElementById('articleEndSelect').value);
    const selected = articleList.slice(start, end + 1);
    document.getElementById('articleDisplay').innerHTML = selected.map(item => 
        `<div style="margin-bottom:10px;">${item.en}<br><small style="color:#7f8c8d">${item.zh}</small></div>`
    ).join('');
    currentArticleText = selected.map(item => item.en).join(' ');
}

function speakArticle() {
    window.speechSynthesis.cancel();
    activeUtterance = new SpeechSynthesisUtterance(currentArticleText);
    activeUtterance.lang = 'en-US';
    activeUtterance.rate = parseFloat(document.getElementById('speedSelect').value);
    window.speechSynthesis.speak(activeUtterance);
}

function startListeningForArticle() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert("浏览器不支持识别");
    const recognition = new SR();
    recognition.lang = 'en-US';
    document.getElementById('diffResult').style.display = 'block';
    document.getElementById('diffContent').innerText = "🎤 正在聆听...";
    recognition.start();
    recognition.onresult = (e) => {
        const spoken = e.results[0][0].transcript;
        document.getElementById('diffContent').innerText = `听到了: "${spoken}" (比对功能开发中)`;
    };
}

// ================= 7. 聊天功能 =================
function switchChatMode(mode) {
    currentChatMode = mode;
    document.getElementById('modeBtnEng').classList.toggle('active', mode === 'eng');
    document.getElementById('modeBtnChn').classList.toggle('active', mode === 'chn');
    document.getElementById('chatLog').innerHTML = `<div class="chat-bubble bubble-ai">${mode==='eng'?'Hi, let\'s chat!':'你好，有什么可以帮你的？'}</div>`;
}

// ... 此处可继续添加 sendChatMessage 等逻辑 ...

// 初始化
window.onload = () => {
    loadAllData();
    const key = localStorage.getItem('silicon_api_key');
    if (key) document.getElementById('siliconApiKey').value = key;
    switchChatMode('eng');
};

function toggleSettings() {
    const card = document.getElementById('settingsCard');
    card.style.display = card.style.display === 'none' ? 'block' : 'none';
}

function saveApiKey() {
    const key = document.getElementById('siliconApiKey').value;
    localStorage.setItem('silicon_api_key', key);
    alert("Key 已保存");
    toggleSettings();
}