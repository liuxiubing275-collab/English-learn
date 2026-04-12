/**
 * AI 英语私教 - 终极功能整合版
 * 包含：基础控制、单词练习、拼写测验、1247看板、AI故事、记忆宫殿、文章听写、AI对话
 */

// ================= [1] 全局变量 =================
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
// 获取上次选择的课本，如果没有则用默认
let currentBookPath = localStorage.getItem('selected_book_path') || 'default';

// 在 window.onload 中设置下拉框初始值
const originalOnload = window.onload;
window.onload = function() {
    if (originalOnload) originalOnload();
    document.getElementById('bookSelect').value = currentBookPath;
};

// ================= [2] 初始化与数据加载 =================
window.onload = function() {
    loadAllData();
    const savedKey = localStorage.getItem('silicon_api_key');
    if (savedKey) {
        document.getElementById('siliconApiKey').value = savedKey;
        document.getElementById('apiKeyStatus').innerText = "✅ API Key 已读取";
        document.getElementById('apiKeyStatus').style.color = "#27ae60";
        document.getElementById('settingsCard').style.display = 'none';
    }
    switchChatMode('eng');
    updateDailyDashboard();
    // 实时更新看板状态
    setInterval(() => {
        const val = document.getElementById('groupSelect').value;
        const gNum = val === 'all' ? '全' : parseInt(val) + 1;
        const activeSpan = document.getElementById('currentActiveGNum');
        if(activeSpan) activeSpan.innerText = gNum;
    }, 500);
};

async function loadAllData() {
    // 确定文件路径
    let wordPath = 'NewWords.txt';
    let textPath = 'Texts.txt';

    if (currentBookPath !== 'default') {
        wordPath = `books/${currentBookPath}/NewWords.txt`;
        textPath = `books/${currentBookPath}/Texts.txt`;
    }

    try {
        // 1. 加载单词
        const wRes = await fetch(wordPath + '?t=' + Date.now()); // 加随机数防止缓存
        if (wRes.ok) {
            const wText = await wRes.text();
            const rawLines = wText.split(/\r?\n/).map(w => w.trim()).filter(w => w.length > 0);
            wordList = [];
            for (let i = 0; i < rawLines.length; i += 3) {
                const parts = rawLines[i].split(/\||:|：/);
                wordList.push({
                    en: parts[0].trim(),
                    zh: parts.length > 1 ? parts[1].trim() : "暂无释义",
                    ex: rawLines[i + 1] || "暂无例句。",
                    hook: rawLines[i + 2] || "暂无记忆钩子。"
                });
            }
            if (wordList.length > 0) {
                initGroupSelect();
                updateWordDisplay();
            }
        }

        // 2. 加载文章
        const aRes = await fetch(textPath + '?t=' + Date.now());
        if (aRes.ok) {
            const aText = await aRes.text();
            const allLines = aText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            articleList = [];
            for (let i = 0; i < allLines.length; i += 2) {
                articleList.push({ en: allLines[i], zh: allLines[i+1] || "" });
            }
            if (articleList.length > 0) initArticleSelect();
        }
        
        // 3. 刷新看板
        updateDailyDashboard();
        
    } catch (e) {
        console.error("切换课本失败:", e);
        alert("无法加载该课本文件，请检查文件夹是否存在。");
    }
}

function changeBook() {
    const select = document.getElementById('bookSelect');
    currentBookPath = select.value;
    
    // 存入本地，下次打开还是这本课本
    localStorage.setItem('selected_book_path', currentBookPath);
    
    // 重置当前单词索引
    currentWordIndex = 0;
    
    // 重新加载数据
    loadAllData();
    
    // 视觉反馈：清空之前的记忆宫殿和 AI 故事区
    if(document.getElementById('memoryPalaceArea')) document.getElementById('memoryPalaceArea').style.display = 'none';
    if(document.getElementById('groupStoryArea')) document.getElementById('groupStoryArea').style.display = 'none';
}

// =========== [3] 单词核心控制 (解决 restartWords 等报错) ===============
function initGroupSelect() {
    const select = document.getElementById('groupSelect');
    if (!select) return;

    // 1. 先清空下拉框
    select.innerHTML = '';

    // 2. 计算总组数（每组10个词）
    const groupCount = Math.ceil(wordList.length / 10);

    // 3. 先循环添加具体的组（第1组，第2组...）
    for (let i = 0; i < groupCount; i++) {
        const start = i * 10 + 1;
        const end = Math.min((i + 1) * 10, wordList.length);
        
        let option = document.createElement('option');
        option.value = i;
        option.text = `📦 第 ${i + 1} 组 (${start} - ${end})`;
        select.appendChild(option);
    }

    // 4. 最后添加“全部练习”选项
    let allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.text = `📚 全部练习 (共 ${wordList.length} 词)`;
    select.appendChild(allOption);

    // 5. 默认选中第一组（索引为0），而不是最后一个“全部练习”
    select.value = 0; 
}

function getGroupBounds() {
    const val = document.getElementById('groupSelect').value;
    if (val === 'all') return { start: 0, end: wordList.length - 1, total: wordList.length };
    const start = parseInt(val) * 10;
    const end = Math.min(start + 9, wordList.length - 1);
    return { start, end, total: end - start + 1 };
}

function updateWordDisplay() {
    if (wordList.length === 0) return;
    const bounds = getGroupBounds();
    const currentWord = wordList[currentWordIndex];

    // 1. 更新单词和计数器
    document.getElementById('targetWord').innerText = currentWord.en;
    document.getElementById('wordCounter').innerText = `${currentWordIndex - bounds.start + 1} / ${bounds.total}`;
    
    // 2. 更新中文释义
    const chineseEl = document.getElementById('chineseMeaning');
    chineseEl.innerText = currentWord.zh;
    chineseEl.style.display = 'none';

    // 3. 【核心修改处】：拆分例句与翻译并换行
    const exBox = document.getElementById('exampleSentence');
    let exHtml = "";
    
    // 逻辑：寻找“中文：”或“  中文：”作为分隔符
    if (currentWord.ex.includes("中文：")) {
        const parts = currentWord.ex.split("中文：");
        exHtml = `
            <div style="color: #2c3e50; font-weight: 500; margin-bottom: 8px; line-height: 1.4;">
                ${parts[0].trim()}
            </div>
            <div style="color: #7f8c8d; font-size: 0.95em; border-top: 1px solid #f0f0f0; padding-top: 8px;">
                <span style="background: #eee; padding: 2px 5px; border-radius: 4px; font-size: 0.8em; margin-right: 5px;">译</span>
                ${parts[1].trim()}
            </div>
        `;
    } else {
        exHtml = `<div style="color: #2c3e50;">${currentWord.ex}</div>`;
    }

    exBox.innerHTML = exHtml;
    exBox.style.display = 'none'; // 默认隐藏

    // 4. 重置状态
    document.getElementById('wordResult').innerText = ""; 
    document.getElementById('dictationResult').innerText = "";
    document.getElementById('dictationInput').value = "";
    
    // 非测验模式下确保单词清晰
    if (document.getElementById('dictationGroupMode').style.display === 'none') {
        document.getElementById('targetWord').style.filter = 'none';
    }
}

function changeGroup() { currentWordIndex = getGroupBounds().start; updateWordDisplay(); }

function nextWord() {
    const bounds = getGroupBounds();
    currentWordIndex++;
    if (currentWordIndex > bounds.end) currentWordIndex = bounds.start;
    updateWordDisplay();
}

function restartWords() { // <-- 修复报错
    currentWordIndex = getGroupBounds().start;
    updateWordDisplay();
}

function toggleBlur() { 
    const el = document.getElementById('targetWord');
    el.style.filter = el.style.filter === 'blur(8px)' ? 'none' : 'blur(8px)';
}

function toggleMeaning() { 
    const el = document.getElementById('chineseMeaning');
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function showAndPlayExample() {
    const exBox = document.getElementById('exampleSentence');
    exBox.style.display = 'block'; 
    
    const currentWord = wordList[currentWordIndex];
    
    // 【优化逻辑】：只提取“中文：”之前的英文部分进行朗读
    let speechText = currentWord.ex;
    if (speechText.includes("中文：")) {
        speechText = speechText.split("中文：")[0];
    }

    // 过滤掉可能残余的特殊字符，执行朗读
    const englishOnly = speechText.replace(/[^\x00-\xff]/g, '').trim();
    if (englishOnly.length > 0) {
        window.speechSynthesis.cancel();
        activeUtterance = new SpeechSynthesisUtterance(englishOnly);
        activeUtterance.lang = 'en-US'; 
        window.speechSynthesis.speak(activeUtterance);
    }
}

function readTargetWord() {
    // 1. 先停止之前的播放
    window.speechSynthesis.cancel();
    
    // 2. 【核心修复】：强制去掉模糊效果
    // 这样即使单词之前因为 toggleBlur 变模糊了，点播放时也会瞬间变清晰
    const wordEl = document.getElementById('targetWord');
    if (wordEl) {
        wordEl.style.filter = 'none';
    }

    // 3. 执行朗读
    if (wordList[currentWordIndex]) {
        activeUtterance = new SpeechSynthesisUtterance(wordList[currentWordIndex].en);
        activeUtterance.lang = 'en-US';
        window.speechSynthesis.speak(activeUtterance);
    }
}

function startListeningForWord() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert("请使用 Safari 或 Chrome。");
    const rec = new SR(); rec.lang = 'en-US';
    const resEl = document.getElementById('wordResult');
    resEl.innerText = "正在聆听..."; rec.start();
    rec.onresult = (e) => {
        const spoken = e.results[0][0].transcript.toLowerCase().replace(/[.,!?]/g, '').trim();
        const target = wordList[currentWordIndex].en.toLowerCase().trim();
        if (spoken === target) { resEl.style.color="#27ae60"; resEl.innerHTML=`✅ 完美: "${spoken}"`; }
        else { resEl.style.color="#e74c3c"; resEl.innerHTML=`❌ 差一点: "${spoken}"`; }
    };
}

function checkDictation() {
    const input = document.getElementById('dictationInput').value.toLowerCase().trim();
    const target = wordList[currentWordIndex].en.toLowerCase().trim();
    const resEl = document.getElementById('dictationResult');
    if (!input) return;
    if (input === target) {
        resEl.style.color="#27ae60"; resEl.innerText="✅ 正确！";
        document.getElementById('targetWord').style.filter="none";
        setTimeout(nextWord, 1500);
    } else { resEl.style.color="#e74c3c"; resEl.innerText="❌ 错误。"; }
}

// ================= [4] 单词组测验逻辑 =================
let groupTestAnswers = [];
let groupTestCurrentIndex = 0;
let groupTestBounds = null;

function startGroupTest() {
    if (wordList.length === 0) return;
    
    // 1. 设置测验范围
    groupTestBounds = getGroupBounds(); 
    groupTestAnswers = []; 
    groupTestCurrentIndex = 0;
    
    // 2. UI 切换
    document.getElementById('dictationSingleMode').style.display = 'none';
    document.getElementById('dictationGroupMode').style.display = 'block';
    document.getElementById('dictationResultMode').style.display = 'none';
    
    // 3. 【核心修改】：测验模式必须强制模糊单词
    const wordEl = document.getElementById('targetWord');
    if (wordEl) {
        wordEl.style.filter = 'blur(8px)';
    }

    // 4. 播放第一个单词
    playTestWord();
}

function playTestWord() {
    const word = wordList[groupTestBounds.start + groupTestCurrentIndex].en;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word); 
    u.lang = 'en-US';
    window.speechSynthesis.speak(u);
    
    // 确保测验播放时，单词依然是模糊的
    document.getElementById('targetWord').style.filter = 'blur(8px)';
    
    document.getElementById('groupTestProgress').innerText = `测验中: ${groupTestCurrentIndex + 1} / ${groupTestBounds.total}`;
    setTimeout(() => document.getElementById('groupTestInput').focus(), 200);
}

function submitTestWord() {
    const val = document.getElementById('groupTestInput').value.trim();
    groupTestAnswers.push(val);
    document.getElementById('groupTestInput').value = "";
    groupTestCurrentIndex++;
    if (groupTestCurrentIndex < groupTestBounds.total) playTestWord();
    else showGroupTestResult();
}

function showGroupTestResult() {
    document.getElementById('dictationGroupMode').style.display = 'none';
    document.getElementById('dictationResultMode').style.display = 'block';
    let correct = 0; let html = "";
    for (let i=0; i<groupTestBounds.total; i++) {
        const target = wordList[groupTestBounds.start + i];
        const isOk = groupTestAnswers[i].toLowerCase() === target.en.toLowerCase();
        if (isOk) correct++;
        html += `<li class="${isOk?'correct-item':'incorrect-item'}"><b>${target.en}</b>: ${isOk?'✅':'❌ 你写了: '+groupTestAnswers[i]}<br><small>${target.zh}</small></li>`;
    }
    document.getElementById('groupTestScore').innerText = `正确率: ${Math.round(correct/groupTestBounds.total*100)}%`;
    document.getElementById('groupTestResultList').innerHTML = html;
}

function quitGroupTest() {
    document.getElementById('dictationGroupMode').style.display = 'none';
    document.getElementById('dictationResultMode').style.display = 'none';
    document.getElementById('dictationSingleMode').style.display = 'block';
    
    // 【核心修复】：退出测验模式，强制还原单词清晰度
    const wordEl = document.getElementById('targetWord');
    if (wordEl) {
        wordEl.style.filter = 'none';
    }
}

// ================= [5] 1247 看板逻辑 =================
function getLocalDateString(date) {
    let y = date.getFullYear();
    let m = (date.getMonth() + 1).toString().padStart(2, '0');
    let d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function markCurrentGroupFinished() {
    const val = document.getElementById('groupSelect').value;
    if (val === 'all') return alert("请选择具体组。");
    const currentGNum = parseInt(val) + 1;
    const today = new Date(); today.setHours(0,0,0,0);
    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    for (let i = 1; i <= currentGNum; i++) {
        let target = new Date(today);
        if (i === currentGNum) {} 
        else if (i === currentGNum - 1) target.setDate(today.getDate() - 1);
        else if (i === currentGNum - 3) target.setDate(today.getDate() - 3);
        else if (i === currentGNum - 6) target.setDate(today.getDate() - 6);
        else target.setDate(today.getDate() - 20);
        history[i] = getLocalDateString(target);
    }
    localStorage.setItem('eng_study_history', JSON.stringify(history));
    alert("🎉 记录成功！复习清单已更新。");
    updateDailyDashboard();
}

function updateDailyDashboard() {
    const dashboard = document.getElementById('taskList');
    if (!dashboard) return;
    const today = new Date(); today.setHours(0,0,0,0);
    document.getElementById('todayDate').innerText = getLocalDateString(today);
    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    let tasks = [];
    let maxG = 0; Object.keys(history).forEach(g => { if(parseInt(g)>maxG) maxG=parseInt(g); });
    tasks.push(`🆕 <b>新课：</b> 第 <a href="#" onclick="jumpToGroup(${maxG})" style="color:#f1c40f; font-weight:bold;">${maxG+1}</a> 组`);
    let review = [];
    for (let g in history) {
        const parts = history[g].split('-');
        const d = new Date(parts[0], parts[1]-1, parts[2]);
        const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
        if ([1, 3, 6].includes(diff)) review.push(`<a href="#" onclick="jumpToGroup(${g-1})" style="color:#f1c40f; font-weight:bold; margin-right:8px;">第 ${g} 组</a>`);
    }
    if (review.length) tasks.push(`<br>🔄 <b>必复习：</b> ${review.reverse().join('')}`);
    dashboard.innerHTML = tasks.join('');
}

function jumpToGroup(idx) { document.getElementById('groupSelect').value = idx; changeGroup(); }

// ================= [6] AI 故事与宫殿生成 =================
async function generateRevisionStory() {
    const apiKey = localStorage.getItem('silicon_api_key');
    if (!apiKey) return alert("请保存 Key");
    const bounds = getGroupBounds();
    let words = []; for(let i=bounds.start; i<=bounds.end; i++) if(wordList[i]) words.push(wordList[i].en);
    const btn = document.getElementById('btnGenStory');
    const box = document.getElementById('aiStoryContent');
    btn.innerText = "⏳ AI 创作中..."; box.style.display="block"; box.innerText="正在构思故事...";
    const prompt = `用这些单词写一段励志短文并加粗，末尾附翻译：[${words.join(", ")}]`;
    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'Qwen/Qwen2.5-7B-Instruct', messages: [{role:"user", content:prompt}] })
        });
        const data = await res.json();
        const content = data.choices[0].message.content;
        box.innerHTML = content.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        document.getElementById('btnShadowStory').style.display = 'block';
        btn.innerText = "重新生成故事";
    } catch (e) { box.innerText = "失败"; btn.innerText = "重试"; }
}
// ================= 快速提取全组预存记忆宫殿 (唯一保留版本) =================
function generateGroupMemoryPalace() {
    const bounds = getGroupBounds();
    if (wordList.length === 0) {
        alert("词库尚未加载，请稍后再试。");
        return;
    }

    const palaceArea = document.getElementById('memoryPalaceArea');
    const palaceContent = document.getElementById('palaceContent');
    
    if (!palaceArea || !palaceContent) {
        alert("页面缺少显示区域（memoryPalaceArea）");
        return;
    }

    let htmlContent = "";
    let foundCount = 0;

    for (let i = bounds.start; i <= bounds.end; i++) {
        const wordObj = wordList[i];
        if (wordObj) {
            foundCount++;
            // 直接读取你在 loadAllData 时存入 wordObj.hook 的内容
            const hookText = wordObj.hook || "（该词暂无预存钩子）";
            
            htmlContent += `
                <div style="margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px dashed #eee;">
                    <strong style="color: #d35400;">${foundCount}. ${wordObj.en}</strong> 
                    <span style="color: #7f8c8d; font-size: 0.9em;">[${wordObj.zh}]</span>
                    <div style="margin-top: 4px; color: #333; line-height: 1.5;">
                        ${hookText.replace('[💡记忆宫殿', '<b style="color:#2980b9;">[💡记忆宫殿</b>')}
                    </div>
                </div>
            `;
        }
    }

    if (foundCount > 0) {
        palaceArea.style.display = 'block';
        palaceContent.innerHTML = htmlContent;
        palaceArea.scrollIntoView({ behavior: 'smooth' });
    } else {
        alert("当前选中的组没有找到单词。");
    }
}

function transferStoryToArticle() {
    const text = document.getElementById('aiStoryContent').innerText;
    const parts = text.split('---');
    currentArticleText = parts[0].trim();
    switchTab('articles');
    document.getElementById('articleDisplay').innerHTML = `<div style="border-left:4px solid #8e44ad; padding-left:10px;"><b>AI故事：</b><br>${parts[0]}<hr><small>${parts[1]||""}</small></div>`;
    quitArticleDictation();
}

// ================= [7] 文章练习逻辑 (含翻页、听写) =================
function initArticleSelect() {
    const s = document.getElementById('articleStartSelect');
    const e = document.getElementById('articleEndSelect');
    s.innerHTML = ''; e.innerHTML = '';
    articleList.forEach((_, i) => { s.add(new Option(`第 ${i+1} 段`, i)); e.add(new Option(`第 ${i+1} 段`, i)); });
    changeArticleRange();
}

function changeArticleRange() {
    const startSel = document.getElementById('articleStartSelect');
    const endSel = document.getElementById('articleEndSelect');
    
    let startIdx = parseInt(startSel.value);
    let endIdx = parseInt(endSel.value);

    // 【修复逻辑】如果起始段落选得比结束段落还晚，强制同步
    if (startIdx > endIdx) {
        endIdx = startIdx;
        endSel.value = endIdx;
    }

    const selected = articleList.slice(startIdx, endIdx + 1);
    
    // 如果没有数据，显示提示
    if (selected.length === 0) {
        document.getElementById('articleDisplay').innerHTML = "未选中有效段落";
        return;
    }

    document.getElementById('articleDisplay').innerHTML = selected.map(item => 
        `<div style="margin-bottom:12px;">${item.en}<br><small style="color:#7f8c8d">${item.zh}</small></div>`
    ).join('');

    // 更新当前练习的纯英文文本
    currentArticleText = selected.map(item => item.en).join(' ');
    
    // 重置比对结果和听写状态
    document.getElementById('diffResult').style.display = 'none';
    quitArticleDictation();
}

function nextArticleRange() {
    const s = document.getElementById('articleStartSelect');
    const e = document.getElementById('articleEndSelect');
    let span = parseInt(e.value) - parseInt(s.value) + 1;
    let nextS = parseInt(s.value) + span;
    if (nextS >= articleList.length) nextS = 0;
    s.value = nextS; e.value = Math.min(nextS + span - 1, articleList.length - 1);
    changeArticleRange();
}

function speakArticle() {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(currentArticleText);
    u.lang = 'en-US'; u.rate = parseFloat(document.getElementById('speedSelect').value);
    window.speechSynthesis.speak(u);
}

function startListeningForArticle() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert("您的浏览器不支持语音识别");

    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    const box = document.getElementById('diffResult');
    const con = document.getElementById('diffContent');

    box.style.display = 'block';
    box.style.borderColor = '#e67e22'; // 橙色表示正在听
    con.innerHTML = "🎤 <strong>请开始朗读...</strong>";

    recognition.start();

    recognition.onresult = (e) => {
        const spoken = e.results[0][0].transcript;
        
        // 【核心修改】：调用比对算法
        const diffHTML = compareSentences(currentArticleText, spoken);
        
        box.style.borderColor = '#27ae60'; // 识别成功变绿
        con.innerHTML = `
            <div style="margin-bottom: 10px; color: #7f8c8d; font-size: 14px; border-bottom: 1px dashed #eee; padding-bottom:5px;">
                <b>AI 听到的内容：</b><br>"${spoken}"
            </div>
            <div style="line-height: 1.8;">
                <b>比对结果（绿色为准确，红色为错漏）：</b><br>${diffHTML}
            </div>
        `;
    };

    recognition.onerror = () => {
        box.style.borderColor = '#e74c3c';
        con.innerHTML = "⚠️ 没听清，请点击按钮重试。";
    };
}

function compareSentences(original, spoken) {
    // 清洗文本：转小写，去掉标点
    let origWords = original.replace(/[.,!?'"]/g, '').toLowerCase().split(/\s+/);
    let spokenWords = spoken.replace(/[.,!?'"]/g, '').toLowerCase().split(/\s+/);
    let originalRawWords = original.split(/\s+/); // 保留带标点的原词用于展示
    
    let resultHTML = [];
    let spokenIdx = 0;

    for (let i = 0; i < origWords.length; i++) {
        if (!origWords[i]) continue;
        
        let found = false;
        // 在说话内容中向后搜索3个词，防止漏读一个词导致全盘变红
        for (let j = spokenIdx; j < Math.min(spokenIdx + 3, spokenWords.length); j++) {
            if (origWords[i] === spokenWords[j]) {
                found = true;
                spokenIdx = j + 1;
                break;
            }
        }

        if (found) {
            resultHTML.push(`<span style="color: #27ae60; font-weight: bold;">${originalRawWords[i]}</span>`);
        } else {
            resultHTML.push(`<span style="color: #e74c3c; text-decoration: line-through;">${originalRawWords[i]}</span>`);
        }
    }
    return resultHTML.join(' ');
}

// 逐句听写 (黄金10秒)
function startArticleDictation() {
    articleSentences = currentArticleText.match(/[^.!?\n]+[.!?\n]+/g) || [currentArticleText];
    articleSentences = articleSentences.map(s => s.trim()).filter(s => s.length > 0);
    currentSentenceIdx = 0;
    document.getElementById('articleDictationSetup').style.display = 'none';
    document.getElementById('articleDictationRunning').style.display = 'block';
    document.getElementById('articleDisplay').style.filter = 'blur(8px)';
    updateArticleDictProgress(); playCurrentSentence();
}

function updateArticleDictProgress() {
    document.getElementById('articleDictProgress').innerText = `听写中: ${currentSentenceIdx+1} / ${articleSentences.length}`;
}

function playCurrentSentence() {
    clearTimeout(sentenceReplayTimer); window.speechSynthesis.cancel();
    const s = articleSentences[currentSentenceIdx];
    const hint = document.getElementById('timerHint');
    hint.innerText = "🔊 第一遍播放...";
    const u = new SpeechSynthesisUtterance(s); u.lang = 'en-US';
    u.onend = () => {
        hint.innerText = "⏳ 10秒后重播...";
        sentenceReplayTimer = setTimeout(() => {
            hint.innerText = "🔊 第二遍播放...";
            window.speechSynthesis.speak(u);
        }, 10000);
    };
    window.speechSynthesis.speak(u);
    setTimeout(()=>document.getElementById('articleDictInput').focus(), 200);
}

function checkArticleDictation() {
    clearTimeout(sentenceReplayTimer); window.speechSynthesis.cancel();
    const ans = articleSentences[currentSentenceIdx];
    const input = document.getElementById('articleDictInput').value.trim();
    const res = document.getElementById('articleDictResult');
    res.style.display = 'block';
    res.innerHTML = `你写了: ${input}<br>正确答案: <b>${ans}</b>`;
    document.getElementById('btnNextSentence').style.display = 'block';
}

function nextDictationSentence() {
    currentSentenceIdx++;
    if (currentSentenceIdx >= articleSentences.length) { alert("🎉 全部完成！"); quitArticleDictation(); }
    else {
        document.getElementById('articleDictResult').style.display = 'none';
        document.getElementById('btnNextSentence').style.display = 'none';
        document.getElementById('articleDictInput').value = "";
        updateArticleDictProgress(); playCurrentSentence();
    }
}

function quitArticleDictation() {
    clearTimeout(sentenceReplayTimer); window.speechSynthesis.cancel();
    document.getElementById('articleDictationRunning').style.display = 'none';
    document.getElementById('articleDictationSetup').style.display = 'block';
    document.getElementById('articleDisplay').style.filter = 'none';
}

// ================= [8] AI 对话 =================
function switchChatMode(mode) {
    currentChatMode = mode;
    document.getElementById('modeBtnEng').classList.toggle('active', mode==='eng');
    document.getElementById('modeBtnChn').classList.toggle('active', mode==='chn');
    document.getElementById('chatLog').innerHTML = `<div class="chat-bubble bubble-ai">${mode==='eng'?'Hi! I am your English teacher.':'你好！有什么我可以帮你的？'}</div>`;
    chatHistory = [{role:"system", content: mode==='eng'?'You are a friendly English teacher. Correct grammar only if it is a major mistake using <纠错>标签.':'你是全能中文助手。'}];
}

async function sendChatMessage() {
    const input = document.getElementById('chatMsgInput');
    const txt = input.value.trim(); if(!txt) return;
    const key = localStorage.getItem('silicon_api_key');
    if(!key) return alert("请存 Key");
    appendChatBubble(txt, 'user');
    input.value = ""; chatHistory.push({role:"user", content:txt});
    const loadingId = appendChatBubble("⏳ ...", 'ai');
    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({model:'Qwen/Qwen2.5-7B-Instruct', messages: chatHistory})
        });
        const data = await res.json();
        const aiTxt = data.choices[0].message.content;
        chatHistory.push({role:"assistant", content:aiTxt});
        updateChatBubble(loadingId, aiTxt);
    } catch(e) { updateChatBubble(loadingId, "Error"); }
}

// ================= [9] 辅助功能 =================
function switchTab(tabName) {
    // 1. 原有的切换板块显示/隐藏逻辑
    document.querySelectorAll('.page-section').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById('page-' + tabName).classList.add('active');
    document.getElementById('btn-' + tabName).classList.add('active');

    // 2. 【新增逻辑】：控制课本选择栏的显隐
    const bookSelector = document.getElementById('bookSelectorContainer');
    if (bookSelector) {
        if (tabName === 'chat') {
            // 如果是聊天模式，隐藏选择栏
            bookSelector.style.display = 'none';
        } else {
            // 如果是单词或文章模式，显示选择栏
            bookSelector.style.display = 'block';
        }
    }
}

function appendChatBubble(t, s) {
    const id = "msg-" + Date.now();
    const div = document.createElement('div');
    div.className = `chat-bubble bubble-${s}`; div.id = id; div.innerText = t;
    document.getElementById('chatLog').appendChild(div);
    return id;
}
function updateChatBubble(id, t) { document.getElementById(id).innerText = t; }
function toggleSettings() { 
    const s = document.getElementById('settingsCard');
    s.style.display = s.style.display === 'none' ? 'block' : 'none';
}
function saveApiKey() {
    const k = document.getElementById('siliconApiKey').value.trim();
    localStorage.setItem('silicon_api_key', k); alert("保存成功"); toggleSettings();
}

// ================= [10] AI 聊天语音识别 (补全功能) =================

function startChatVoice() {
    // 1. 检查浏览器兼容性
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        return alert("您的浏览器不支持语音识别，请在 iPhone Safari 或 Chrome 浏览器中使用。");
    }

    const recognition = new SpeechRecognition();
    
    // 2. 根据当前模式自动切换识别语言
    // 如果是英语私教模式，听英文；如果是中文助手模式，听中文
    recognition.lang = (currentChatMode === 'eng') ? 'en-US' : 'zh-CN';
    
    const inputEl = document.getElementById('chatMsgInput');
    const originalPlaceholder = inputEl.placeholder;
    
    // 3. 开始录音时的 UI 反馈
    inputEl.placeholder = "🎤 正在聆听，请说话...";
    recognition.start();

    // 4. 识别成功处理
    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        inputEl.value = transcript; // 将识别出的文字填入输入框
        inputEl.placeholder = originalPlaceholder;
        
        // 自动触发发送逻辑
        sendChatMessage();
    };

    // 5. 错误处理
    recognition.onerror = function(event) {
        console.error("语音识别错误:", event.error);
        inputEl.placeholder = "⚠️ 没听清，请重试...";
        setTimeout(() => {
            inputEl.placeholder = originalPlaceholder;
        }, 2000);
    };

    // 6. 结束录音
    recognition.onend = function() {
        if (inputEl.placeholder.includes("正在聆听")) {
            inputEl.placeholder = originalPlaceholder;
        }
    };
}

// ================= [补全功能] 11词成文逻辑 =================

async function generateGroupStory() {
    // 1. 获取 API Key
    const apiKey = localStorage.getItem('silicon_api_key');
    if (!apiKey) {
        alert("请先在‘互动聊天’版块设置并保存 API Key！");
        return;
    }

    // 2. 获取当前组单词
    const bounds = getGroupBounds();
    let currentWords = [];
    for (let i = bounds.start; i <= bounds.end; i++) {
        if (wordList[i] && wordList[i].en) {
            currentWords.push(wordList[i].en);
        }
    }

    if (currentWords.length === 0) {
        alert("当前组没有单词，请先选择一个单词组。");
        return;
    }

    // 3. UI 状态
    const storyArea = document.getElementById('groupStoryArea');
    const storyContent = document.getElementById('groupStoryContent');
    if (!storyArea) {
        alert("HTML中缺少 id='groupStoryArea' 的显示区域");
        return;
    }

    storyArea.style.display = 'block';
    storyContent.innerText = "正在构思故事...";
    storyArea.scrollIntoView({ behavior: 'smooth' });

    // 4. 发送 API 请求
    const prompt = `使用以下 10 个单词编写一段连贯的英语短文（约 100 词），单词需加粗。结尾附带中文翻译，中间用 --- 分隔：[${currentWords.join(", ")}]`;

    try {
        const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'Qwen/Qwen2.5-7B-Instruct',
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7
            })
        });

        const data = await response.json();
        const fullText = data.choices[0].message.content;

        // 5. 渲染到界面
        storyContent.innerHTML = fullText
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#e67e22;">$1</strong>');

    } catch (error) {
        console.error(error);
        storyContent.innerText = "⚠️ 生成失败，请检查网络或 API Key。";
    }
}

// 联动：同步到文章板块
function transferGroupStoryToArticle() {
    const storyBox = document.getElementById('groupStoryContent');
    if (!storyBox || storyBox.innerText.includes("正在构思")) return;

    const parts = storyBox.innerText.split('---');
    currentArticleText = parts[0].trim();
    
    switchTab('articles');
    
    const articleDisplay = document.getElementById('articleDisplay');
    articleDisplay.innerHTML = `
        <div style="border-left: 4px solid #8e44ad; padding-left: 10px; background: #fdf6ff;">
            <p style="color: #8e44ad; font-weight: bold;">✨ AI 单词挑战故事：</p>
            <p>${currentArticleText}</p>
            <p style="color: #7f8c8d; font-size: 14px;">${parts[1] || ""}</p>
        </div>
    `;
    quitArticleDictation();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ================= [补全功能] 1247 手动计算复习计划 =================

function calculateReviewGroups() {
    const inputVal = document.getElementById('currentGroupInput').value;
    if (!inputVal) {
        alert("请输入你今天正在学习的组号（例如：7）");
        return;
    }
    
    const N = parseInt(inputVal);
    const reviewOffsets = [1, 3, 6]; // 1-2-4-7 法则的偏移量
    const resultArea = document.getElementById('reviewResultArea');
    const linksSpan = document.getElementById('reviewLinks');
    const aiStoryArea = document.getElementById('aiStoryArea');
    
    if (!resultArea || !linksSpan) {
        console.error("HTML 中缺少复习结果显示区域");
        return;
    }

    let reviewGroups = [];
    reviewOffsets.forEach(offset => {
        let target = N - offset;
        if (target >= 1) {
            reviewGroups.push(target);
        }
    });

    if (reviewGroups.length === 0) {
        linksSpan.innerHTML = "<span style='color:#7f8c8d'>前期积累中，暂无复习任务。</span>";
    } else {
        linksSpan.innerHTML = "";
        // 倒序排列，让最近的组号排在前面
        reviewGroups.reverse().forEach(gNum => {
            const link = document.createElement('a');
            link.href = "#";
            link.innerText = `第 ${gNum} 组`;
            // 设置明显的黄色链接样式，呼应看板风格
            link.style = "color: #f39c12; font-weight: bold; text-decoration: underline; margin-right: 15px; cursor: pointer;";
            link.onclick = (e) => {
                e.preventDefault();
                jumpToGroup(gNum - 1); // 索引从 0 开始
            };
            linksSpan.appendChild(link);
        });
    }

    // 显示结果区域和 AI 故事生成区域
    resultArea.style.display = 'block';
    if (aiStoryArea) aiStoryArea.style.display = 'block';
    
    // 自动清理之前的 AI 故事内容，防止混淆
    const storyContent = document.getElementById('aiStoryContent');
    if (storyContent) {
        storyContent.style.display = 'none';
        storyContent.innerHTML = "";
    }
}

// ======================================================
// ================= 每日翻译挑战逻辑系统 =================
// ======================================================

let translationTasks = []; // 存储题目：{cn: "", userEn: "", correctEn: ""}
let copySentenceQueue = []; // 需要抄写的句子队列
let currentCopyCount = 0;  // 当前句子的抄写次数进度

// 1. 开始挑战：AI 出题
async function startTranslationChallenge() {
    const apiKey = localStorage.getItem('silicon_api_key');
    if (!apiKey) return alert("请先在设置中保存 API Key");

    // 获取当前组单词作为出题参考
    const bounds = getGroupBounds();
    let words = [];
    for (let i = bounds.start; i <= bounds.end; i++) {
        if (wordList[i]) words.push(wordList[i].en);
    }

    // UI 切换到加载状态
    document.getElementById('transSetup').style.display = 'none';
    document.getElementById('transWorking').style.display = 'block';
    const qBox = document.getElementById('transQuestions');
    qBox.innerHTML = "<p style='text-align:center; color:#8e44ad;'>正在联络 AI 老师针对你的单词进度出题...</p>";

    const prompt = `你是一位英语老师。请根据以下 10 个单词：[${words.join(", ")}]，编写 3 个简单的日常中文句子要求用户翻译成英文。
    要求：
    1. 句子要生活化。
    2. 必须包含列表中的单词含义。
    3. 格式严格如下（每行一句）：
    1. [中文句子1]
    2. [中文句子2]
    3. [中文句子3]`;

    try {
        const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'Qwen/Qwen2.5-7B-Instruct',
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7
            })
        });
        const data = await response.json();
        const content = data.choices[0].message.content;
        
        // 解析题目
        const lines = content.match(/\[(.*?)\]/g) || [];
        if (lines.length < 3) throw new Error("解析失败");

        translationTasks = lines.map(l => ({ 
            cn: l.replace(/[\[\]]/g, ''), 
            userEn: '', 
            correctEn: '' 
        }));

        qBox.innerHTML = translationTasks.map((t, i) => `
            <div style="margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">
                <p><b>句 ${i+1}:</b> ${t.cn}</p>
                <input type="text" class="trans-user-input" data-idx="${i}" placeholder="请翻译成英文...">
            </div>
        `).join('');

    } catch (e) {
        alert("出题失败，请重试");
        document.getElementById('transSetup').style.display = 'block';
        document.getElementById('transWorking').style.display = 'none';
    }
}

// 2. AI 批改：并排对比
async function gradeTranslations() {
    const apiKey = localStorage.getItem('silicon_api_key');
    const inputs = document.querySelectorAll('.trans-user-input');
    inputs.forEach(input => {
        const idx = input.getAttribute('data-idx');
        translationTasks[idx].userEn = input.value.trim();
    });

    const btn = document.getElementById('btnSubmitTrans');
    btn.innerText = "⏳ AI 正在深度批改并给出地道答案...";
    btn.disabled = true;

    const prompt = `你是一位英语私教。请批改以下翻译并给出最地道的答案。
    ${translationTasks.map((t, i) => `题${i+1} 中文：${t.cn} 用户翻译：${t.userEn}`).join('\n')}
    
    输出要求：只输出地道答案，不要解释，每句一行，放在方括号中。格式如下：
    1. [正确答案1]
    2. [正确答案2]
    3. [正确答案3]`;

    try {
        const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'Qwen/Qwen2.5-7B-Instruct',
                messages: [{ role: "user", content: prompt }]
            })
        });
        const data = await response.json();
        const corrects = data.choices[0].message.content.match(/\[(.*?)\]/g) || [];

        // 3. 构建对比界面
        const resBox = document.getElementById('transResult');
        const compareArea = document.getElementById('transComparisonArea');
        resBox.style.display = 'block';
        
        let html = '<h3 style="margin-top:0; color:#e67e22;">对照批改结果：</h3>';
        copySentenceQueue = []; // 初始化抄写队列

        translationTasks.forEach((t, i) => {
            const correctText = (corrects[i] || "[Correct sentence]").replace(/[\[\]]/g, '');
            t.correctEn = correctText;
            copySentenceQueue.push(correctText); // 加入抄写任务

            html += `
                <div style="display:flex; gap:10px; margin-bottom:15px; border:1px solid #eee; padding:10px; border-radius:10px; background:white;">
                    <div style="flex:1; color:#e74c3c; border-right:1px solid #eee; padding-right:5px;">
                        <small style="color:#999">你的翻译:</small><br>${t.userEn || "(未输入)"}
                    </div>
                    <div style="flex:1; color:#27ae60;">
                        <small style="color:#999">地道参考:</small><br><b>${correctText}</b>
                    </div>
                </div>
            `;
        });

        compareArea.innerHTML = html;
        document.getElementById('transWorking').style.display = 'none';
        btn.disabled = false;
        btn.innerText = "✅ 提交 AI 批改";

        // 4. 进入抄写环节
        startCopyExercise();

    } catch (e) {
        alert("批改失败");
        btn.disabled = false;
    }
}

// 4. 抄写练习逻辑
function startCopyExercise() {
    if (copySentenceQueue.length === 0) return;
    
    currentCopyCount = 0;
    document.getElementById('copyExerciseArea').style.display = 'block';
    updateCopyDisplay();
    
    // 自动滚动到抄写区
    document.getElementById('copyExerciseArea').scrollIntoView({ behavior: 'smooth' });
}

function updateCopyDisplay() {
    const target = copySentenceQueue[0];
    const sentenceNum = 3 - copySentenceQueue.length + 1;
    document.getElementById('copyTargetBox').innerText = target;
    document.getElementById('copyProgressText').innerText = `第 ${sentenceNum}/3 句 | 抄写进度：${currentCopyCount} / 5`;
    document.getElementById('copyInput').value = "";
    document.getElementById('copyInput').focus();
}

function handleCopyInput() {
    const inputEl = document.getElementById('copyInput');
    const inputVal = inputEl.value.trim();
    const targetVal = copySentenceQueue[0].trim();

    // 科学校验：忽略最后的标点符号和大小写
    const cleanInput = inputVal.replace(/[.,!?'"]/g, '').toLowerCase();
    const cleanTarget = targetVal.replace(/[.,!?'"]/g, '').toLowerCase();

    if (cleanInput === cleanTarget) {
        currentCopyCount++;
        if (currentCopyCount >= 5) {
            // 当前句子完成
            copySentenceQueue.shift();
            if (copySentenceQueue.length > 0) {
                alert("非常好！下一句。");
                currentCopyCount = 0;
                updateCopyDisplay();
            } else {
                // 全部 3 句完成
                alert("🎉 太棒了！今日 3 句地道表达已深度肌肉记忆！");
                resetTranslationSection();
            }
        } else {
            updateCopyDisplay();
        }
    } else {
        alert("拼写有误，请仔细对照上方绿色文字抄写哦！");
        inputEl.select(); // 选中错误的文字方便修改
    }
}

function resetTranslationSection() {
    document.getElementById('copyExerciseArea').style.display = 'none';
    document.getElementById('transResult').style.display = 'none';
    document.getElementById('transSetup').style.display = 'block';
}
