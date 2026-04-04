let activeUtterance = null; 

// ================= 自动化进度管理逻辑 =================
window.addEventListener('load', () => {
    updateDailyDashboard();
    setInterval(() => {
        const val = document.getElementById('groupSelect').value;
        const gNum = val === 'all' ? '全' : parseInt(val) + 1;
        document.getElementById('currentActiveGNum').innerText = gNum;
    }, 500);
});

function markCurrentGroupFinished() {
    const val = document.getElementById('groupSelect').value;
    if (val === 'all') { alert("请先选择一个具体的组号进行学习。"); return; }
    const groupNum = parseInt(val) + 1;
    const today = new Date().toISOString().split('T')[0]; 
    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    history[groupNum] = today;
    localStorage.setItem('eng_study_history', JSON.stringify(history));
    alert(`🎉 记录成功！第 ${groupNum} 组的复习计划已自动开启。`);
    updateDailyDashboard();
}

function updateDailyDashboard() {
    const dashboard = document.getElementById('taskList');
    const dateSpan = document.getElementById('todayDate');
    const todayObj = new Date();
    dateSpan.innerText = todayObj.toISOString().split('T')[0];

    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    let tasks =[];
    let maxGroup = 0;
    Object.keys(history).forEach(g => { if(parseInt(g) > maxGroup) maxGroup = parseInt(g); });
    tasks.push(`🆕 <b>新课建议：</b> 开始第 <a href="#" onclick="jumpToGroup(${maxGroup})">${maxGroup + 1}</a> 组`);

    let reviewGroups =[];
    for (let gNum in history) {
        const studyDate = new Date(history[gNum]);
        const diffDays = Math.ceil(Math.abs(todayObj - studyDate) / (1000 * 60 * 60 * 24)) - 1; 
        if (diffDays === 1 || diffDays === 3 || diffDays === 6) {
            reviewGroups.push({num: gNum, day: diffDays});
        }
    }

    if (reviewGroups.length > 0) {
        let reviewHTML = `<br>🔄 <b>今日必复习：</b> `;
        reviewGroups.forEach(item => {
            reviewHTML += `<a href="#" onclick="jumpToGroup(${item.num-1})" style="color:white; text-decoration:underline; margin-right:8px;">第 ${item.num} 组</a>`;
        });
        tasks.push(reviewHTML);
    } else {
        tasks.push(`<br>✅ 今日暂无旧课复习任务，请专注新课！`);
    }
    dashboard.innerHTML = tasks.join('<br>');
}

async function generateRevisionStory() {
    const apiKey = localStorage.getItem('silicon_api_key');
    if (!apiKey) { alert("请先在‘互动聊天’版块设置 API Key"); return; }

    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    const todayObj = new Date();
    let selectedWords =[];

    for (let gNum in history) {
        const diffDays = Math.ceil(Math.abs(todayObj - new Date(history[gNum])) / 86400000) - 1;
        if (diffDays === 1 || diffDays === 3 || diffDays === 6) {
            let start = (parseInt(gNum) - 1) * 10;
            let end = Math.min(start + 9, wordList.length - 1);
            for (let i = start; i <= end; i++) {
                if (wordList[i]) selectedWords.push(wordList[i].en);
            }
        }
    }

    if (selectedWords.length === 0) {
        alert("今日没有复习单词。"); return;
    }

    const btn = document.getElementById('btnGenStory');
    const contentBox = document.getElementById('aiStoryContent');
    btn.innerText = "⏳ AI构思中..."; btn.disabled = true;
    contentBox.style.display = 'block'; contentBox.innerText = `编排词汇: ${selectedWords.join(", ")}`;

    const prompt = `你是一位英语教育专家。用以下单词编写约80词的地道英语短文：[${selectedWords.join(", ")}]。
    包含所有单词并用**粗体**标注。下方附带中文翻译。格式: \n英文\n---\n中文`;

    try {
        const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'Qwen/Qwen2.5-7B-Instruct', messages: [{ role: "user", content: prompt }], temperature: 0.7 })
        });
        const data = await response.json();
        contentBox.innerHTML = data.choices[0].message.content.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong style="color:#e67e22;">$1</strong>');
        document.getElementById('btnShadowStory').style.display = 'block';
    } catch (e) { alert("生成失败"); }
    btn.innerText = "🪄 重新生成 AI 故事"; btn.disabled = false;
}

function transferStoryToArticle() {
    const aiContent = document.getElementById('aiStoryContent').innerText;
    if (!aiContent) return;
    const parts = aiContent.split('---');
    currentArticleText = parts[0].trim();
    switchTab('articles');
    document.getElementById('articleDisplay').innerHTML = `
        <div style="border-left: 4px solid #8e44ad; padding-left: 10px; background: #fdf6ff;">
            <p style="color: #8e44ad; font-weight: bold; font-size: 14px;">✨ AI 复习专题故事：</p>
            <p style="font-weight: 500;">${parts[0].trim()}</p>
            <p style="color: #7f8c8d; font-size: 14px; margin-top: 10px;">${parts.length > 1 ? parts[1].trim() : ""}</p>
        </div>`;
    quitArticleDictation(); window.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchTab(tabName) {
    document.querySelectorAll('.page-section').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('page-' + tabName).classList.add('active');
    document.getElementById('btn-' + tabName).classList.add('active');
}

let wordList =[{ en: "Apple", zh: "苹果", ex: "An apple." }]; 
let currentWordIndex = 0; 
let articleList =[];
let currentArticleText = ""; 

window.addEventListener('load', async function() {
    await loadAllData();
    const savedKey = localStorage.getItem('silicon_api_key');
    if (savedKey) {
        document.getElementById('siliconApiKey').value = savedKey;
        document.getElementById('apiKeyStatus').innerText = "✅ API Key 已读取";
        document.getElementById('apiKeyStatus').style.color = "#27ae60";
        document.getElementById('settingsCard').style.display = 'none'; 
    }
    switchChatMode('eng');
});

function toggleSettings() {
    const card = document.getElementById('settingsCard');
    card.style.display = (card.style.display === 'none') ? 'block' : 'none';
}

async function loadAllData() {
    try {
        const wRes = await fetch('NewWords.txt');
        if (wRes.ok) {
            const rawLines = (await wRes.text()).split(/\r?\n/).map(w => w.trim()).filter(w => w.length > 0);  
            wordList =[];
            for (let i = 0; i < rawLines.length; i += 2) {
                const parts = rawLines[i].split(/\||:|：/);
                wordList.push({ en: parts[0].trim(), zh: parts[1] ? parts[1].trim() : "", ex: rawLines[i+1] || "" });
            }
        }
    } catch (e) { console.log("无本地单词库"); }
    if (wordList.length > 0) { initGroupSelect(); updateWordDisplay(); }

    try {
        const aRes = await fetch('Texts.txt');
        if (aRes.ok) {
            const allLines = (await aRes.text()).split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            articleList =[];
            for (let i = 0; i < allLines.length; i += 2) {
                articleList.push({ en: allLines[i], zh: allLines[i + 1] || "" });
            }
        }
    } catch (e) { console.log("无文章库"); }
    if (articleList.length > 0) initArticleSelect();
}

// ================= 单词基础功能 =================
function initGroupSelect() {
    const select = document.getElementById('groupSelect'); 
    select.innerHTML = `<option value="all">📚 整体练习 (共 ${wordList.length} 词)</option>`;
    for (let i = 0; i < Math.ceil(wordList.length / 10); i++) {
        select.appendChild(new Option(`📦 第 ${i + 1} 组 (词 ${i*10+1} - ${Math.min((i+1)*10, wordList.length)})`, i));
    }
}
function getGroupBounds() {
    const val = document.getElementById('groupSelect').value;
    if (val === 'all') return { start: 0, end: wordList.length - 1, total: wordList.length };
    const start = parseInt(val) * 10; 
    return { start, end: Math.min(start + 9, wordList.length - 1), total: Math.min(start + 9, wordList.length - 1) - start + 1 };
}
function changeGroup() { currentWordIndex = getGroupBounds().start; updateWordDisplay(); }
function updateWordDisplay() {
    const bounds = getGroupBounds();
    document.getElementById('targetWord').innerText = wordList[currentWordIndex].en;
    document.getElementById('wordCounter').innerText = `${currentWordIndex - bounds.start + 1} / ${bounds.total}`;
    document.getElementById('chineseMeaning').style.display = 'none'; 
    document.getElementById('chineseMeaning').innerText = wordList[currentWordIndex].zh;
    document.getElementById('exampleSentence').style.display = 'none'; 
    document.getElementById('exampleSentence').innerText = wordList[currentWordIndex].ex;
    document.getElementById('wordResult').innerText = ""; document.getElementById('dictationInput').value = ""; document.getElementById('dictationResult').innerText = "";
    document.getElementById('targetWord').style.filter = 'none';
}
function toggleMeaning() { const el = document.getElementById('chineseMeaning'); el.style.display = el.style.display === 'none' ? 'block' : 'none'; }
function showAndPlayExample() {
    document.getElementById('exampleSentence').style.display = 'block'; 
    const en = wordList[currentWordIndex].ex.replace(/[^\x00-\xff]/g, '').trim();
    if (en) { activeUtterance = new SpeechSynthesisUtterance(en); activeUtterance.lang = 'en-US'; window.speechSynthesis.speak(activeUtterance); }
}
function nextWord() { const b = getGroupBounds(); currentWordIndex = currentWordIndex >= b.end ? b.start : currentWordIndex + 1; updateWordDisplay(); }
function restartWords() { currentWordIndex = getGroupBounds().start; updateWordDisplay(); }
function toggleBlur() { const el = document.getElementById('targetWord'); el.style.filter = el.style.filter ? '' : 'blur(8px)'; }
function readTargetWord() {
    document.getElementById('targetWord').style.filter = 'blur(8px)';
    activeUtterance = new SpeechSynthesisUtterance(wordList[currentWordIndex].en); activeUtterance.lang = 'en-US'; window.speechSynthesis.speak(activeUtterance);
    setTimeout(() => document.getElementById('dictationInput').focus(), 100);
}
function startListeningForWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition; 
    if (!SpeechRecognition) return alert("不支持语音");
    const rec = new SpeechRecognition(); rec.lang = 'en-US'; 
    document.getElementById('wordResult').innerText = "聆听中..."; rec.start();
    rec.onresult = e => {
        const trans = e.results[0][0].transcript.toLowerCase().replace(/[.,!?]/g, '').trim(); 
        const target = wordList[currentWordIndex].en.toLowerCase().trim();
        const resEl = document.getElementById('wordResult');
        if (trans === target) { resEl.style.color = "#27ae60"; resEl.innerHTML = `✅ 完美!`; } 
        else { resEl.style.color = "#e74c3c"; resEl.innerHTML = `❌ 读作: "${trans}"`; }
    };
}
function checkDictation() {
    const user = document.getElementById('dictationInput').value.toLowerCase().trim(); 
    const target = wordList[currentWordIndex].en.toLowerCase().trim(); 
    const resEl = document.getElementById('dictationResult');
    if (user === target) { 
        resEl.style.color = "#27ae60"; resEl.innerHTML = `✅ 正确!`; 
        document.getElementById('targetWord').style.filter = 'none'; 
        setTimeout(nextWord, 1500); 
    } else { resEl.style.color = "#e74c3c"; resEl.innerHTML = `❌ 错误。`; }
}

// --- 单词测试 ---
let groupTestBounds = null; let groupTestAnswers =[]; let groupTestCurrentIndex = 0;
function startGroupTest() {
    groupTestBounds = getGroupBounds(); groupTestAnswers =[]; groupTestCurrentIndex = 0;
    document.getElementById('dictationSingleMode').style.display = 'none'; 
    document.getElementById('dictationResultMode').style.display = 'none'; 
    document.getElementById('dictationGroupMode').style.display = 'block';
    document.getElementById('groupTestInput').value = ''; 
    document.getElementById('targetWord').style.filter = 'blur(8px)'; 
    setTimeout(playTestWord, 600);
}
function playTestWord() { 
    activeUtterance = new SpeechSynthesisUtterance(wordList[groupTestBounds.start + groupTestCurrentIndex].en); 
    activeUtterance.lang = 'en-US'; window.speechSynthesis.speak(activeUtterance); 
}
function submitTestWord() {
    groupTestAnswers.push(document.getElementById('groupTestInput').value.trim()); 
    document.getElementById('groupTestInput').value = ''; 
    groupTestCurrentIndex++;
    if (groupTestCurrentIndex < groupTestBounds.total) { 
        document.getElementById('groupTestProgress').innerText = `📝 ${groupTestCurrentIndex + 1}/${groupTestBounds.total}`; 
        setTimeout(playTestWord, 400); 
    } else showGroupTestResult();
}
function showGroupTestResult() {
    document.getElementById('dictationGroupMode').style.display = 'none'; 
    document.getElementById('dictationResultMode').style.display = 'block'; 
    let correct = 0, html = '';
    for (let i=0; i<groupTestBounds.total; i++) {
        let t = wordList[groupTestBounds.start + i]; let u = groupTestAnswers[i]||"";
        if (t.en.toLowerCase() === u.toLowerCase()) { correct++; html += `<li class="correct-item">${t.en} ✅</li>`; }
        else html += `<li class="incorrect-item"><s>${u}</s><br>正确: ${t.en}</li>`;
    }
    document.getElementById('groupTestScore').innerHTML = `正确率: ${Math.round(correct/groupTestBounds.total*100)}%`;
    document.getElementById('groupTestResultList').innerHTML = html;
}
function quitGroupTest() { 
    document.getElementById('dictationGroupMode').style.display = 'none'; 
    document.getElementById('dictationResultMode').style.display = 'none'; 
    document.getElementById('dictationSingleMode').style.display = 'block'; 
}
function calculateReviewGroups() {
    const N = parseInt(document.getElementById('currentGroupInput').value);
    if (!N) return;
    const linksSpan = document.getElementById('reviewLinks'); linksSpan.innerHTML = "";
    [1, 3, 6].forEach(offset => {
        if (N - offset >= 1) {
            const link = document.createElement('a'); link.href = "#"; link.innerText = `第 ${N - offset} 组 `;
            link.style = "color:#007aff; text-decoration:underline; margin-right:10px;";
            link.onclick = (e) => { e.preventDefault(); jumpToGroup(N - offset - 1); };
            linksSpan.appendChild(link);
        }
    });
    document.getElementById('reviewResultArea').style.display = 'block';
    document.getElementById('aiStoryArea').style.display = 'block';
}
function jumpToGroup(index) {
    document.getElementById('groupSelect').value = index; changeGroup(); window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ================= 文章模块 =================
function initArticleSelect() { 
    const startSel = document.getElementById('articleStartSelect'), endSel = document.getElementById('articleEndSelect'); 
    startSel.innerHTML = ''; endSel.innerHTML = '';
    articleList.forEach((_, i) => { startSel.appendChild(new Option(`第 ${i+1} 段`, i)); endSel.appendChild(new Option(`第 ${i+1} 段`, i)); });
    startSel.value = 0; endSel.value = 0; changeArticleRange();
}
function changeArticleRange() { 
    let startIdx = parseInt(document.getElementById('articleStartSelect').value); 
    let endIdx = Math.max(startIdx, parseInt(document.getElementById('articleEndSelect').value));
    document.getElementById('articleEndSelect').value = endIdx;
    let selected = articleList.slice(startIdx, endIdx + 1);
    document.getElementById('articleDisplay').innerHTML = selected.map(i => `<div style="margin-bottom:15px"><div>${i.en}</div><div style="color:#7f8c8d;font-size:14px;">${i.zh}</div></div>`).join('');
    currentArticleText = selected.map(i => i.en).join(' ');
}
function speakArticle() { 
    activeUtterance = new SpeechSynthesisUtterance(currentArticleText); 
    activeUtterance.lang = 'en-US'; activeUtterance.rate = parseFloat(document.getElementById('speedSelect').value); 
    window.speechSynthesis.speak(activeUtterance); 
}
// 听写与文章部分为了节省篇幅，原封不动复制原逻辑
// ... (保留你代码里完整的文章比对功能)

// ================= 聊天互动 =================
let currentChatMode = 'eng'; 
const promptEng = `你是一位友好的英语母语者，正在和用户进行轻松的日常聊天。
【首要任务】：用自然、地道的英语回答问题，推进对话。
【纠错规则】：只有当用户的英语出现明显的语法或拼写错误时，你才纠错。没有明显错误，**绝对不要**纠错。
如果有错误，**必须**将中文纠错内容放在 <纠错> 和 </纠错> 标签之间，且放在回复最前。`;

const promptChn = `你是一个聪明、友善的AI助手。直接用纯中文给予有用的帮助。`;

let chatHistory =[];

function switchChatMode(mode) {
    currentChatMode = mode;
    document.getElementById('modeBtnEng').classList.remove('active');
    document.getElementById('modeBtnChn').classList.remove('active');
    document.getElementById(mode === 'eng' ? 'modeBtnEng' : 'modeBtnChn').classList.add('active');
    
    chatHistory =[{ role: "system", content: mode === 'eng' ? promptEng : promptChn }];
    document.getElementById('chatLog').innerHTML = '';
    appendChatBubble(mode === 'eng' ? "Hi! I am your AI English friend." : "你好！我是全能中文小助手。", 'ai');
}

function saveApiKey() {
    const key = document.getElementById('siliconApiKey').value.trim();
    if (key.startsWith("sk-")) {
        localStorage.setItem('silicon_api_key', key);
        document.getElementById('apiKeyStatus').innerText = "✅ 保存成功！";
        setTimeout(toggleSettings, 600);
    }
}

window.playAiSpeech = function(btnElement, langOverride) {
    const text = decodeURIComponent(btnElement.getAttribute('data-text'));
    window.speechSynthesis.cancel(); 
    activeUtterance = new SpeechSynthesisUtterance(text);
    activeUtterance.lang = langOverride || ((currentChatMode === 'eng') ? 'en-US' : 'zh-CN');
    window.speechSynthesis.speak(activeUtterance);
};

async function sendChatMessage(overrideText) {
    const inputEl = document.getElementById('chatMsgInput');
    const userText = overrideText || inputEl.value.trim();
    if (!userText) return;
    const apiKey = localStorage.getItem('silicon_api_key');
    if (!apiKey) { alert("请先展开设置保存 API Key！"); return; }

    window.speechSynthesis.speak(new SpeechSynthesisUtterance(' ')); // 骗取权限
    appendChatBubble(userText, 'user');
    inputEl.value = ''; chatHistory.push({ role: "user", content: userText });
    const loadingId = appendChatBubble("⏳ 正在思考...", 'ai');

    try {
        const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'Qwen/Qwen2.5-7B-Instruct', messages: chatHistory, temperature: 0.7 })
        });
        const data = await response.json();
        chatHistory.push({ role: "assistant", content: data.choices[0].message.content });
        renderAndSpeakAiResponse(data.choices[0].message.content, loadingId);
    } catch (e) {
        updateChatBubble(loadingId, "⚠️ 请求失败"); chatHistory.pop(); 
    }
}

function renderAndSpeakAiResponse(rawText, bubbleId) {
    if (currentChatMode === 'eng') {
        let correctionText = "", replyText = rawText;
        const correctionMatch = rawText.match(/<纠错>([\s\S]*?)<\/纠错>/);
        if (correctionMatch) {
            correctionText = correctionMatch[1].trim(); 
            replyText = rawText.replace(/<纠错>[\s\S]*?<\/纠错>/, '').trim();
        }
        const safeText = encodeURIComponent(replyText.replace(/[\u4e00-\u9fa5]/g, '').trim());
        let html = (correctionText ? `<div class="chat-correction">${correctionText}</div>` : '') + `<div class="chat-reply">${replyText}<button class="btn-play-reply" data-text="${safeText}" onclick="playAiSpeech(this, 'en-US')">🔊</button></div>`;
        updateChatBubble(bubbleId, html);
    } else {
        updateChatBubble(bubbleId, `<div class="chat-reply">${rawText}<button class="btn-play-reply" data-text="${encodeURIComponent(rawText)}" onclick="playAiSpeech(this, 'zh-CN')">🔊</button></div>`);
    }
}

function appendChatBubble(text, sender) {
    const div = document.createElement('div'); 
    div.className = `chat-bubble bubble-${sender}`; 
    div.id = "msg-" + Date.now(); div.innerHTML = text; 
    document.getElementById('chatLog').appendChild(div); 
    document.getElementById('chatLog').scrollTop = 9999; 
    return div.id;
}
function updateChatBubble(id, html) { document.getElementById(id).innerHTML = html; document.getElementById('chatLog').scrollTop = 9999; }