// ================= 全局变量 =================
let activeUtterance = null;
let wordList = [];
let currentWordIndex = 0;
let articleList = [];
let currentArticleText = "";
let articleSentences = [];
let currentSentenceIdx = 0;
let sentenceReplayTimer = null;

// ================= 基础导航 =================
function switchTab(tabName) {
    document.querySelectorAll('.page-section').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('page-' + tabName).classList.add('active');
    document.getElementById('btn-' + tabName).classList.add('active');
}

// ================= 数据加载 =================
async function loadAllData() {
    try {
        // 加载单词
        const wRes = await fetch('NewWords.txt');
        if (wRes.ok) {
            const wText = await wRes.text();
            const rawLines = wText.split(/\r?\n/).map(w => w.trim()).filter(w => w.length > 0);
            wordList = [];
            for (let i = 0; i < rawLines.length; i += 2) {
                const wordLine = rawLines[i];
                const sentenceLine = (i + 1 < rawLines.length) ? rawLines[i+1] : "暂无例句。";
                const parts = wordLine.split(/\||:|：/);
                wordList.push({ en: parts[0].trim(), zh: parts.length > 1 ? parts[1].trim() : "暂无中文", ex: sentenceLine });
            }
            initGroupSelect();
            updateWordDisplay();
        }

        // 加载文章（每两行一组：英+中）
        const aRes = await fetch('Texts.txt');
        if (aRes.ok) {
            const aText = await aRes.text();
            const allLines = aText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            articleList = [];
            for (let i = 0; i < allLines.length; i += 2) {
                articleList.push({ en: allLines[i], zh: allLines[i+1] || "" });
            }
            initArticleSelect();
        }
        updateDailyDashboard();
    } catch (e) { console.error("加载数据出错:", e); }
}

// ================= 文章跟读逻辑 =================
function initArticleSelect() {
    const startSel = document.getElementById('articleStartSelect');
    const endSel = document.getElementById('articleEndSelect');
    startSel.innerHTML = ''; endSel.innerHTML = '';
    articleList.forEach((_, index) => {
        let opt1 = document.createElement('option'); opt1.value = index; opt1.text = `第 ${index + 1} 段`;
        let opt2 = document.createElement('option'); opt2.value = index; opt2.text = `第 ${index + 1} 段`;
        startSel.appendChild(opt1); endSel.appendChild(opt2);
    });
    startSel.value = 0; endSel.value = 0;
    changeArticleRange();
}

function changeArticleRange() {
    let startIdx = parseInt(document.getElementById('articleStartSelect').value);
    let endIdx = parseInt(document.getElementById('articleEndSelect').value);
    if (endIdx < startIdx) { endIdx = startIdx; document.getElementById('articleEndSelect').value = endIdx; }

    let selectedItems = articleList.slice(startIdx, endIdx + 1);
    let htmlContent = "";
    selectedItems.forEach(item => {
        htmlContent += `<div style="margin-bottom:15px;"><div style="color:#2c3e50;font-weight:500;">${item.en}</div><div style="color:#7f8c8d;font-size:14px;">${item.zh}</div></div>`;
    });
    document.getElementById('articleDisplay').innerHTML = htmlContent;
    currentArticleText = selectedItems.map(item => item.en).join(' ');
    quitArticleDictation();
}

function speakArticle() {
    window.speechSynthesis.cancel();
    activeUtterance = new SpeechSynthesisUtterance(currentArticleText);
    activeUtterance.lang = 'en-US';
    activeUtterance.rate = parseFloat(document.getElementById('speedSelect').value);
    window.speechSynthesis.speak(activeUtterance);
}

// 这里就是报错提示缺失的函数！
function startListeningForArticle() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("请在 Safari 或 Chrome 中使用语音功能");

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    const diffBox = document.getElementById('diffResult');
    diffBox.style.display = 'block';
    document.getElementById('diffContent').innerHTML = "🎤 正在聆听...";
    recognition.start();

    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        const diffHTML = compareSentences(currentArticleText, transcript);
        document.getElementById('diffContent').innerHTML = `<strong>你读的是:</strong> "${transcript}"<br><strong>对比:</strong> ${diffHTML}`;
    };
}

// 辅助函数：对比文本
function compareSentences(original, spoken) {
    let origWords = original.replace(/[.,!?'"]/g, '').toLowerCase().split(/\s+/);
    let spokenWords = spoken.replace(/[.,!?'"]/g, '').toLowerCase().split(/\s+/);
    let originalRawWords = original.split(/\s+/);
    let resultHTML = [], spokenIdx = 0;
    for (let i = 0; i < origWords.length; i++) {
        let found = false;
        for (let j = spokenIdx; j < Math.min(spokenIdx + 3, spokenWords.length); j++) {
            if (origWords[i] === spokenWords[j]) { found = true; spokenIdx = j + 1; break; }
        }
        if (found) resultHTML.push(`<span style="color:#27ae60;">${originalRawWords[i]}</span>`);
        else resultHTML.push(`<span style="color:#e74c3c;text-decoration:line-through;">${originalRawWords[i]}</span>`);
    }
    return resultHTML.join(' ');
}

// ================= AI 故事生成 (方案三) =================
async function generateRevisionStory() {
    const apiKey = localStorage.getItem('silicon_api_key');
    if (!apiKey) return alert("请先在‘互动聊天’版块保存 API Key");

    // 逻辑：提取今日到期单词，若无则提取当前组
    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    const todayStr = new Date().toISOString().split('T')[0];
    let selectedWords = [];

    // 简化版：这里直接取当前选中组的所有词作为示例
    const val = document.getElementById('groupSelect').value;
    if (val !== 'all') {
        let start = parseInt(val) * 10;
        let end = Math.min(start + 9, wordList.length - 1);
        for (let i = start; i <= end; i++) selectedWords.push(wordList[i].en);
    }

    if (selectedWords.length === 0) return alert("请先选择一组单词");

    const btn = document.getElementById('btnGenStory');
    btn.innerText = "⏳ AI 正在编写...";
    
    const prompt = `Write a short English story (150 words) using these words: [${selectedWords.join(", ")}]. Bold the words. Provide Chinese translation at the end after '---'.`;

    try {
        const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'Qwen/Qwen2.5-7B-Instruct', messages: [{role:"user", content: prompt}] })
        });
        const data = await response.json();
        const content = data.choices[0].message.content;
        document.getElementById('aiStoryContent').style.display = 'block';
        document.getElementById('aiStoryContent').innerHTML = content.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        document.getElementById('btnShadowStory').style.display = 'block';
        btn.innerText = "🪄 重新生成故事";
    } catch (e) { alert("AI 请求失败"); }
}

// ================= 看板与 1247 逻辑 =================
function updateDailyDashboard() {
    document.getElementById('todayDate').innerText = new Date().toISOString().split('T')[0];
    // ... 看板更新逻辑 ...
}

function jumpToGroup(idx) {
    document.getElementById('groupSelect').value = idx;
    changeGroup();
}

// 页面加载初始化
window.onload = function() {
    loadAllData();
    const savedKey = localStorage.getItem('silicon_api_key');
    if (savedKey) document.getElementById('siliconApiKey').value = savedKey;
};

// ... 此处省略之前已有的单词显示、拼写检查、对话逻辑等 ...
// (请确保你原来的这些功能函数也在 app.js 中)