    <script>
        // ================= 全局 & 导航 =================
        let activeUtterance = null; 

// ================= 方案一：自动化进度管理逻辑 =================

// 初始化：页面加载时刷新看板
window.addEventListener('load', () => {
    updateDailyDashboard();
    // 同时也更新看板上显示的当前组号
    setInterval(() => {
        const val = document.getElementById('groupSelect').value;
        const gNum = val === 'all' ? '全' : parseInt(val) + 1;
        document.getElementById('currentActiveGNum').innerText = gNum;
    }, 500);
});

// 1. 标记当前组为“已学完”并记录日期
function markCurrentGroupFinished() {
    const val = document.getElementById('groupSelect').value;
    if (val === 'all') { alert("请先选择一个具体的组号进行学习。"); return; }
    
    const groupNum = parseInt(val) + 1;
    const today = new Date().toISOString().split('T')[0]; // 格式: 2023-10-27

    // 读取历史记录
    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    
    // 存入当前组的完成日期
    history[groupNum] = today;
    localStorage.setItem('eng_study_history', JSON.stringify(history));
    
    alert(`🎉 记录成功！第 ${groupNum} 组的复习计划已自动开启。`);
    updateDailyDashboard();
}

// 2. 核心计算：根据遗忘曲线计算今日任务
function updateDailyDashboard() {
    const dashboard = document.getElementById('taskList');
    const dateSpan = document.getElementById('todayDate');
    const todayObj = new Date();
    const todayStr = todayObj.toISOString().split('T')[0];
    dateSpan.innerText = todayStr;

    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    let tasks = [];
    
    // 找出最大的组号，建议学习下一组
    let maxGroup = 0;
    Object.keys(history).forEach(g => { if(parseInt(g) > maxGroup) maxGroup = parseInt(g); });
    tasks.push(`🆕 <b>新课建议：</b> 开始第 <a href="#" onclick="jumpToGroup(${maxGroup})">${maxGroup + 1}</a> 组`);

    // 筛选需要复习的组 (根据 1, 3, 6 天的间隔)
    let reviewGroups = [];
    for (let gNum in history) {
        const studyDate = new Date(history[gNum]);
        const diffTime = Math.abs(todayObj - studyDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) - 1; 

        // 对应 1-2-4-7 逻辑中的复习点：1天后, 4天后(3天间隔), 7天后(6天间隔)
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

// 核心函数：生成 AI 复习故事
async function generateRevisionStory() {
    const apiKey = localStorage.getItem('silicon_api_key');
    if (!apiKey) { alert("请先在‘互动聊天’版块设置并保存 API Key"); return; }

    // 自动逻辑：从历史记录中抓取符合 1,3,6 天规则的所有单词
    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    const todayObj = new Date();
    let selectedWords = [];

    for (let gNum in history) {
        const studyDate = new Date(history[gNum]);
        const diffDays = Math.ceil(Math.abs(todayObj - studyDate) / (1000 * 60 * 60 * 24)) - 1;

        if (diffDays === 1 || diffDays === 3 || diffDays === 6) {
            let start = (parseInt(gNum) - 1) * 10;
            let end = Math.min(start + 9, wordList.length - 1);
            for (let i = start; i <= end; i++) {
                if (wordList[i]) selectedWords.push(wordList[i].en);
            }
        }
    }

    if (selectedWords.length === 0) {
        alert("今日没有到期的复习单词。建议你先学习新课并点击‘标记完成’。");
        return;
    }

    // 2. UI 状态更新
    const btn = document.getElementById('btnGenStory');
    const contentBox = document.getElementById('aiStoryContent');
    btn.innerText = "⏳ AI 正在构思故事并翻译...";
    btn.disabled = true;
    contentBox.style.display = 'block';
    contentBox.innerText = "正在通过词汇 [ " + selectedWords.join(", ") + " ] 编写情境故事...";

    // 3. 构建 Prompt
    const prompt = `你是一位英语教育专家。请使用以下单词编写一段连贯、地道的英语短文（约80词）：[${selectedWords.join(", ")}]。
    要求：
    1. 故事内容要积极向上、有逻辑。
    2. 必须包含所有给定的单词，并将这些单词在文中用 **粗体** 标注。
    3. 在短文下方提供准确的中文翻译。
    格式要求：
    英文部分...
    ---
    中文翻译...`;

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
        const fullResult = data.choices[0].message.content;

        // 4. 显示结果
        contentBox.innerHTML = fullResult.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong style="color:#e67e22;">$1</strong>');
        document.getElementById('btnShadowStory').style.display = 'block';
        btn.innerText = "🪄 重新生成 AI 故事";
        btn.disabled = false;

    } catch (error) {
        console.error(error);
        alert("生成失败，请检查网络或 API Key");
        btn.innerText = "🪄 重新生成 AI 故事";
        btn.disabled = false;
    }
}

// 联动函数：将 AI 故事发送到文章板块
function transferStoryToArticle() {
    const aiContent = document.getElementById('aiStoryContent').innerText;
    if (!aiContent) return;

    // 分离中英文（根据 --- 分隔符）
    const parts = aiContent.split('---');
    const englishText = parts[0].trim();
    const chineseText = parts.length > 1 ? parts[1].trim() : "";

    // 更新全局文章变量
    currentArticleText = englishText;
    
    // 跳转到文章版块
    switchTab('articles');

    // 直接渲染到文章显示区（模拟 Texts.txt 的结构）
    const articleDisplay = document.getElementById('articleDisplay');
    articleDisplay.innerHTML = `
        <div style="border-left: 4px solid #8e44ad; padding-left: 10px; background: #fdf6ff;">
            <p style="color: #8e44ad; font-weight: bold; font-size: 14px;">✨ AI 复习专题故事：</p>
            <p style="font-weight: 500;">${englishText}</p>
            <p style="color: #7f8c8d; font-size: 14px; margin-top: 10px;">${chineseText}</p>
        </div>
    `;

    // 自动重置听写功能，准备进行精听
    quitArticleDictation();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
        
        function switchTab(tabName) {
            document.querySelectorAll('.page-section').forEach(page => page.classList.remove('active'));
            document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
            document.getElementById('page-' + tabName).classList.add('active');
            document.getElementById('btn-' + tabName).classList.add('active');
        }

        let wordList =[{ en: "Apple", zh: "苹果(示例)", ex: "An apple a day." }]; 
        let currentWordIndex = 0; 
        let articleList =["Please create Texts.txt file to load articles."];
        let currentArticleText = ""; 

        window.onload = function() {
            loadAllData();
            const savedKey = localStorage.getItem('silicon_api_key');
            if (savedKey) {
                document.getElementById('siliconApiKey').value = savedKey;
                document.getElementById('apiKeyStatus').innerText = "✅ API Key 已读取";
                document.getElementById('apiKeyStatus').style.color = "#27ae60";
                document.getElementById('settingsCard').style.display = 'none'; 
            }
            // 初始化聊天模式为英文
            switchChatMode('eng');
        };

        function toggleSettings() {
            const card = document.getElementById('settingsCard');
            card.style.display = (card.style.display === 'none') ? 'block' : 'none';
        }

        async function loadAllData() {
            try {
                const wRes = await fetch('./data/NewWords.txt');
                if (wRes.ok) {
                    const wText = await wRes.text();
                    const rawLines = wText.split(/\r?\n/).map(w => w.trim()).filter(w => w.length > 0);  
                    wordList =[];
                    for (let i = 0; i < rawLines.length; i += 2) {
                        const wordLine = rawLines[i];
                        const sentenceLine = (i + 1 < rawLines.length) ? rawLines[i+1] : "暂无例句。";
                        const parts = wordLine.split(/\||:|：/);
                        wordList.push({ en: parts[0].trim(), zh: parts.length > 1 ? parts[1].trim() : "暂无中文释义", ex: sentenceLine });
                    }
                }
            } catch (e) { console.log("单词库未找到"); }
            if (wordList.length > 0) { initGroupSelect(); updateWordDisplay(); }

            try {
        	const aRes = await fetch('./data/Texts.txt');
        	if (aRes.ok) {
            	const aText = await aRes.text();
            	// 修改点：将文本按行切割，过滤空行
            	const allLines = aText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            	articleList = [];
            	// 每两行组成一个对象 { en: "...", zh: "..." }
            	for (let i = 0; i < allLines.length; i += 2) {
                	articleList.push({
                    	en: allLines[i],
                    	zh: allLines[i + 1] || "" // 如果最后一行没翻译，给个空字符串
                	});
            	           }
        	      }
    	} catch (e) { console.log("文章库未找到"); }
    	if (articleList.length > 0) { initArticleSelect(); }
}
        // ================= 单词基础功能 =================
        function initGroupSelect() {
            const select = document.getElementById('groupSelect'); select.innerHTML = `<option value="all">📚 整体练习 (共 ${wordList.length} 词)</option>`;
            const groupCount = Math.ceil(wordList.length / 10);
            for (let i = 0; i < groupCount; i++) {
                const start = i * 10 + 1; const end = Math.min((i + 1) * 10, wordList.length);
                let option = document.createElement('option'); option.value = i; option.text = `📦 第 ${i + 1} 组 (词汇 ${start} - ${end})`;
                select.appendChild(option);
            }
        }
        function getGroupBounds() {
            const val = document.getElementById('groupSelect').value;
            if (val === 'all') return { start: 0, end: wordList.length - 1, total: wordList.length };
            const start = parseInt(val) * 10; return { start, end: Math.min(start + 9, wordList.length - 1), total: Math.min(start + 9, wordList.length - 1) - start + 1 };
        }
        function changeGroup() { currentWordIndex = getGroupBounds().start; updateWordDisplay(); }
        function updateWordDisplay() {
            const bounds = getGroupBounds();
            document.getElementById('targetWord').innerText = wordList[currentWordIndex].en;
            document.getElementById('wordCounter').innerText = `${currentWordIndex - bounds.start + 1} / ${bounds.total}`;
            document.getElementById('chineseMeaning').style.display = 'none'; document.getElementById('chineseMeaning').innerText = wordList[currentWordIndex].zh;
            document.getElementById('exampleSentence').style.display = 'none'; document.getElementById('exampleSentence').innerText = wordList[currentWordIndex].ex;
            document.getElementById('wordResult').innerText = ""; document.getElementById('dictationInput').value = ""; document.getElementById('dictationResult').innerText = "";
            document.getElementById('targetWord').style.filter = 'none';
        }
        function toggleMeaning() { const el = document.getElementById('chineseMeaning'); el.style.display = el.style.display === 'none' ? 'block' : 'none'; }
        function showAndPlayExample() {
            document.getElementById('exampleSentence').style.display = 'block'; 
            const fullSentence = wordList[currentWordIndex].ex;
            if (fullSentence !== "暂无例句。") {
                const englishPart = fullSentence.replace(/[^\x00-\xff]/g, '').trim();
                if (englishPart.length > 0) {
                    activeUtterance = new SpeechSynthesisUtterance(englishPart);
                    activeUtterance.lang = 'en-US'; window.speechSynthesis.speak(activeUtterance);
                }
            }
        }
        function nextWord() { if (wordList.length === 0) return; const bounds = getGroupBounds(); currentWordIndex++; if (currentWordIndex > bounds.end) currentWordIndex = bounds.start; updateWordDisplay(); }
        function restartWords() { if (wordList.length === 0) return; currentWordIndex = getGroupBounds().start; updateWordDisplay(); }
        function toggleBlur() { const wordEl = document.getElementById('targetWord'); wordEl.style.filter = wordEl.style.filter === 'blur(8px)' ? 'none' : 'blur(8px)'; }
        function readTargetWord() {
            document.getElementById('targetWord').style.filter = 'blur(8px)';
            activeUtterance = new SpeechSynthesisUtterance(wordList[currentWordIndex].en); activeUtterance.lang = 'en-US'; window.speechSynthesis.speak(activeUtterance);
            setTimeout(() => { document.getElementById('dictationInput').focus(); }, 100);
        }
        function startListeningForWord() {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SpeechRecognition) return alert("请在 Safari 中使用。");
            const recognition = new SpeechRecognition(); recognition.lang = 'en-US'; 
            document.getElementById('wordResult').style.color = "#333"; document.getElementById('wordResult').innerText = "正在聆听..."; recognition.start();
            recognition.onresult = function(event) {
                const transcript = event.results[0][0].transcript.toLowerCase().replace(/[.,!?]/g, '').trim(); const target = wordList[currentWordIndex].en.toLowerCase().trim(); const resultEl = document.getElementById('wordResult');
                if (transcript === target) { resultEl.style.color = "#27ae60"; resultEl.innerHTML = `✅ 完美！读作: "${transcript}"`; } else { resultEl.style.color = "#e74c3c"; resultEl.innerHTML = `❌ 差一点，读作: "${transcript}"`; }
            };
        }
        function checkDictation() {
            const userInput = document.getElementById('dictationInput').value.toLowerCase().trim(); const targetWord = wordList[currentWordIndex].en.toLowerCase().trim(); const resultEl = document.getElementById('dictationResult');
            if (userInput === "") return resultEl.innerText = "⚠️ 请输入单词！";
            if (userInput === targetWord) { resultEl.style.color = "#27ae60"; resultEl.innerHTML = `✅ 完全正确！`; document.getElementById('targetWord').style.filter = 'none'; document.getElementById('dictationInput').blur(); setTimeout(() => { nextWord(); }, 1500); } 
            else { resultEl.style.color = "#e74c3c"; resultEl.innerHTML = `❌ 拼写错误。`; }
        }

        // --- 单词连续测验 ---
        let groupTestBounds = null; let groupTestAnswers =[]; let groupTestCurrentIndex = 0;
        function startGroupTest() {
            if (wordList.length === 0) return;
            groupTestBounds = getGroupBounds(); groupTestAnswers =[]; groupTestCurrentIndex = 0;
            document.getElementById('dictationSingleMode').style.display = 'none'; document.getElementById('dictationResultMode').style.display = 'none'; document.getElementById('dictationGroupMode').style.display = 'block';
            document.getElementById('groupTestInput').value = ''; document.getElementById('groupTestProgress').innerText = `📝 听写测验: 第 ${groupTestCurrentIndex + 1} 词 / 共 ${groupTestBounds.total} 词`;
            document.getElementById('targetWord').style.filter = 'blur(8px)'; setTimeout(() => { playTestWord(); }, 600);
        }
        function playTestWord() { activeUtterance = new SpeechSynthesisUtterance(wordList[groupTestBounds.start + groupTestCurrentIndex].en); activeUtterance.lang = 'en-US'; window.speechSynthesis.speak(activeUtterance); setTimeout(() => { document.getElementById('groupTestInput').focus(); }, 100); }
        function submitTestWord() {
            const inputEl = document.getElementById('groupTestInput'); groupTestAnswers.push(inputEl.value.trim()); inputEl.value = ''; groupTestCurrentIndex++;
            if (groupTestCurrentIndex < groupTestBounds.total) { document.getElementById('groupTestProgress').innerText = `📝 听写测验: 第 ${groupTestCurrentIndex + 1} 词 / 共 ${groupTestBounds.total} 词`; setTimeout(() => { playTestWord(); }, 400); } else { showGroupTestResult(); }
        }
        function showGroupTestResult() {
            document.getElementById('dictationGroupMode').style.display = 'none'; document.getElementById('dictationResultMode').style.display = 'block'; document.getElementById('targetWord').style.filter = 'none'; 
            let correctCount = 0; let htmlList = '';
            for (let i = 0; i < groupTestBounds.total; i++) {
                let absIndex = groupTestBounds.start + i; let targetWord = wordList[absIndex].en; let userAnswer = groupTestAnswers[i] || ""; let isCorrect = (targetWord.toLowerCase().trim() === userAnswer.toLowerCase());
                if (isCorrect) { correctCount++; htmlList += `<li class="correct-item"><strong>${targetWord}</strong> <span style="float:right; color:#7f8c8d; font-size: 14px;">✅ 正确</span><div style="font-size:13px; color:#7f8c8d; margin-top:4px;">${wordList[absIndex].zh}</div></li>`; } 
                else { htmlList += `<li class="incorrect-item"><span style="font-size: 14px;">你写了: <s>${userAnswer === "" ? "(留空)" : userAnswer}</s></span><br>正确答案: <strong>${targetWord}</strong><div style="font-size:13px; color:#7f8c8d; margin-top:4px;">${wordList[absIndex].zh}</div></li>`; }
            }
            let accuracy = Math.round((correctCount / groupTestBounds.total) * 100);
            document.getElementById('groupTestScore').innerHTML = `<span style="color: ${accuracy >= 80 ? '#27ae60' : (accuracy >= 60 ? '#f39c12' : '#e74c3c')};">🎯 正确率: ${accuracy}%</span><br><span style="font-size: 16px; color: #7f8c8d;">(写对 ${correctCount} 个 / 共 ${groupTestBounds.total} 个)</span>`;
            document.getElementById('groupTestResultList').innerHTML = htmlList; document.getElementById('groupTestInput').blur();
        }
        function quitGroupTest() { document.getElementById('dictationGroupMode').style.display = 'none'; document.getElementById('dictationResultMode').style.display = 'none'; document.getElementById('dictationSingleMode').style.display = 'block'; document.getElementById('targetWord').style.filter = 'none'; }

    // 新增：1247复习逻辑
    function calculateReviewGroups() {
    const inputVal = document.getElementById('currentGroupInput').value;
    if (!inputVal) { alert("请输入当前组号"); return; }
    
    const N = parseInt(inputVal);
    const reviewOffsets = [1, 3, 6]; // 对应 1, 4, 7 天周期的组数偏移
    const resultArea = document.getElementById('reviewResultArea');
    const linksSpan = document.getElementById('reviewLinks');
    
    let reviewGroups = [];
    reviewOffsets.forEach(offset => {
        let target = N - offset;
        if (target >= 1) {
            reviewGroups.push(target);
        }
    });

    if (reviewGroups.length === 0) {
        linksSpan.innerHTML = "前期积累中，暂无复习任务。";
    } else {
        linksSpan.innerHTML = "";
        reviewGroups.forEach(gNum => {
            // 创建可点击的蓝色链接
            const link = document.createElement('a');
            link.href = "#";
            link.innerText = `第 ${gNum} 组`;
            link.style = "color: #007aff; font-weight: bold; text-decoration: underline; margin-right: 10px; cursor: pointer;";
            link.onclick = (e) => {
                e.preventDefault();
                jumpToGroup(gNum - 1); // 索引是从0开始的
            };
            linksSpan.appendChild(link);
        });
    }
    resultArea.style.display = 'block';
document.getElementById('aiStoryArea').style.display = 'block';
document.getElementById('aiStoryContent').style.display = 'none';
document.getElementById('btnShadowStory').style.display = 'none';
}

// 新增：跳转词组的辅助函数
function jumpToGroup(index) {
    const select = document.getElementById('groupSelect');
    if (index >= 0 && index < select.options.length - 1) {
        select.value = index;
        changeGroup(); // 触发原有的切换逻辑
        // 滚动到顶部方便练习
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        alert("该组号不存在");
    }
}

        // ================= 文章：多段落连读 =================
        function initArticleSelect() { 
            const startSel = document.getElementById('articleStartSelect'); const endSel = document.getElementById('articleEndSelect'); 
            startSel.innerHTML = ''; endSel.innerHTML = '';
            articleList.forEach((_, index) => { 
                let opt1 = document.createElement('option'); opt1.value = index; opt1.text = `第 ${index + 1} 段`; 
                let opt2 = document.createElement('option'); opt2.value = index; opt2.text = `第 ${index + 1} 段`; 
                startSel.appendChild(opt1); endSel.appendChild(opt2);
            });
            startSel.value = 0; endSel.value = 0; changeArticleRange();
        }
        function changeArticleRange() { 
    let startIdx = parseInt(document.getElementById('articleStartSelect').value); 
    let endIdx = parseInt(document.getElementById('articleEndSelect').value);
    if (endIdx < startIdx) { endIdx = startIdx; document.getElementById('articleEndSelect').value = endIdx; }
    // 选中的段落范围
    let selectedItems = articleList.slice(startIdx, endIdx + 1);
    
    // 修改点：构造带有翻译的 HTML 结构
    let htmlContent = "";
    selectedItems.forEach(item => {
        htmlContent += `
            <div style="margin-bottom: 15px;">
                <div style="color: #2c3e50; font-weight: 500;">${item.en}</div>
                <div style="color: #7f8c8d; font-size: 14px; margin-top: 4px;">${item.zh}</div>
            </div>
        `;
    });
    
    // 更新显示区域（注意：这里改用 innerHTML）
    document.getElementById('articleDisplay').innerHTML = htmlContent;

    currentArticleText = selectedItems.map(item => item.en).join(' ');
    
    document.getElementById('diffResult').style.display = 'none'; 
    document.getElementById('articleDisplay').style.filter = 'none'; 
    quitArticleDictation(); 
        }
        function nextArticleRange() {
            if (articleList.length === 0) return;
            let startIdx = parseInt(document.getElementById('articleStartSelect').value); let endIdx = parseInt(document.getElementById('articleEndSelect').value);
            let span = endIdx - startIdx + 1; startIdx = startIdx + span; if (startIdx >= articleList.length) startIdx = 0; endIdx = Math.min(startIdx + span - 1, articleList.length - 1);
            document.getElementById('articleStartSelect').value = startIdx; document.getElementById('articleEndSelect').value = endIdx; changeArticleRange();
        }
        function speakArticle() { activeUtterance = new SpeechSynthesisUtterance(currentArticleText); activeUtterance.lang = 'en-US'; activeUtterance.rate = parseFloat(document.getElementById('speedSelect').value); window.speechSynthesis.speak(activeUtterance); }
        function startListeningForArticle() {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SpeechRecognition) return;
            const recognition = new SpeechRecognition(); recognition.lang = 'en-US'; recognition.interimResults = false; 
            const diffBox = document.getElementById('diffResult'), diffContent = document.getElementById('diffContent'); diffBox.style.display = 'block'; diffBox.style.borderColor = '#e67e22'; diffContent.innerHTML = "🎤 <strong>正在聆听... 读完请停顿</strong>"; recognition.start();
            recognition.onresult = function(event) { const diffHTML = compareSentences(currentArticleText, event.results[0][0].transcript); diffBox.style.borderColor = '#27ae60'; diffContent.innerHTML = diffHTML; };
            recognition.onerror = () => { diffBox.style.borderColor = '#e74c3c'; diffContent.innerHTML = "⚠️ 未听到声音。"; };
        }
        function compareSentences(original, spoken) {
            let origWords = original.replace(/[.,!?'"]/g, '').toLowerCase().split(/\s+/); let spokenWords = spoken.replace(/[.,!?'"]/g, '').toLowerCase().split(/\s+/); let originalRawWords = original.split(/\s+/); let resultHTML =[], spokenIdx = 0; 
            for (let i = 0; i < origWords.length; i++) {
                if(origWords[i] === "") continue; let found = false;
                for(let j = spokenIdx; j < Math.min(spokenIdx + 3, spokenWords.length); j++) { if (origWords[i] === spokenWords[j]) { found = true; spokenIdx = j + 1; break; } }
                if (found) resultHTML.push(`<span style="color: #27ae60; font-weight: bold;">${originalRawWords[i]}</span>`); else resultHTML.push(`<span style="color: #e74c3c; text-decoration: line-through;">${originalRawWords[i]}</span>`);
            } return resultHTML.join(' ');
        }

        // --- 文章逐句听写 ---
        let articleSentences =[]; let currentSentenceIdx = 0; let sentenceReplayTimer = null;
    function startArticleDictation() {
    if (articleList.length === 0) return alert("文章库为空！");
    
    // 获取当前选中的英文句子
    let startIdx = parseInt(document.getElementById('articleStartSelect').value); 
    let endIdx = parseInt(document.getElementById('articleEndSelect').value);
    let selectedItems = articleList.slice(startIdx, endIdx + 1);

    // 将选中的每一组的英文部分组合起来，然后拆成单句
    let combinedEn = selectedItems.map(item => item.en).join(' ');
    articleSentences = combinedEn.match(/[^.!?\n]+[.!?\n]+/g) || [combinedEn];
    
    articleSentences = articleSentences.map(s => s.trim()).filter(s => s.length > 0); 
    currentSentenceIdx = 0;
    
    document.getElementById('articleDictationSetup').style.display = 'none'; 
    document.getElementById('articleDictationRunning').style.display = 'block'; 
    document.getElementById('articleDictResult').style.display = 'none'; 
    document.getElementById('btnNextSentence').style.display = 'none'; 
    document.getElementById('articleDictInput').value = '';
    document.getElementById('articleDisplay').style.filter = 'blur(8px)';
    updateArticleDictProgress(); 
    setTimeout(() => { playCurrentSentence(); }, 500);
}
        function updateArticleDictProgress() { document.getElementById('articleDictProgress').innerText = `正在听写: 第 ${currentSentenceIdx + 1} 句 / 共 ${articleSentences.length} 句`; }
        function playCurrentSentence() {
            clearTimeout(sentenceReplayTimer); window.speechSynthesis.cancel(); const sentence = articleSentences[currentSentenceIdx]; const speed = parseFloat(document.getElementById('speedSelect').value); const hintEl = document.getElementById('timerHint');
            hintEl.innerText = "🔊 第一遍播放中..."; hintEl.style.color = "#e67e22";
            activeUtterance = new SpeechSynthesisUtterance(sentence); activeUtterance.lang = 'en-US'; activeUtterance.rate = speed;
            activeUtterance.onend = function() {
                hintEl.innerText = "⏳ 间隔 10 秒后播放第二遍..."; hintEl.style.color = "#7f8c8d";
                sentenceReplayTimer = setTimeout(() => {
                    hintEl.innerText = "🔊 第二遍播放中..."; hintEl.style.color = "#e67e22";
                    let utterance2 = new SpeechSynthesisUtterance(sentence); utterance2.lang = 'en-US'; utterance2.rate = speed;
                    utterance2.onend = function() { hintEl.innerText = "✍️ 播放完毕，请完成输入并按回车..."; }; window.speechSynthesis.speak(utterance2);
                }, 10000); 
            };
            window.speechSynthesis.speak(activeUtterance); setTimeout(() => { document.getElementById('articleDictInput').focus(); }, 100);
        }
        function checkArticleDictation() {
            clearTimeout(sentenceReplayTimer); window.speechSynthesis.cancel(); document.getElementById('timerHint').innerText = "✅ 批改完成"; document.getElementById('timerHint').style.color = "#27ae60";
            const userInput = document.getElementById('articleDictInput').value.trim(); const targetSentence = articleSentences[currentSentenceIdx];
            let origWords = targetSentence.replace(/[.,!?'"]/g, '').toLowerCase().split(/\s+/); let userWords = userInput.replace(/[.,!?'"]/g, '').toLowerCase().split(/\s+/); let originalRawWords = targetSentence.split(/\s+/); let resultHTML =[], userIdx = 0;
            for (let i = 0; i < origWords.length; i++) {
                if (origWords[i] === "") continue; let found = false;
                for (let j = userIdx; j < Math.min(userIdx + 3, userWords.length); j++) { if (origWords[i] === userWords[j]) { found = true; userIdx = j + 1; break; } }
                if (found) resultHTML.push(`<span style="color: #27ae60; font-weight: bold;">${originalRawWords[i]}</span>`); else resultHTML.push(`<span style="color: #e74c3c; font-weight: bold; text-decoration: underline;">${originalRawWords[i]}</span>`);
            }
            const resBox = document.getElementById('articleDictResult'); resBox.style.display = 'block'; resBox.style.borderColor = "#8e44ad";
            resBox.innerHTML = `<div style="margin-bottom: 10px; font-size: 15px; color: #7f8c8d;"><strong>📝 你写的是:</strong><br> ${userInput || "(未输入内容)"}</div><div style="font-size: 16px;"><strong>🎯 正确答案比对:</strong><br> ${resultHTML.join(' ')}</div>`;
            document.getElementById('articleDictInput').blur(); document.getElementById('btnNextSentence').style.display = 'block';
        }
        function nextDictationSentence() {
            currentSentenceIdx++; if (currentSentenceIdx >= articleSentences.length) { alert("🎉 太棒了！本选中段落均已听写完成！"); quitArticleDictation(); return; }
            document.getElementById('articleDictResult').style.display = 'none'; document.getElementById('btnNextSentence').style.display = 'none'; document.getElementById('articleDictInput').value = ''; updateArticleDictProgress(); playCurrentSentence();
        }
        function quitArticleDictation() {
            clearTimeout(sentenceReplayTimer); window.speechSynthesis.cancel(); document.getElementById('articleDictationSetup').style.display = 'block'; document.getElementById('articleDictationRunning').style.display = 'none'; document.getElementById('articleDisplay').style.filter = 'none';
        }

        // =========================================================================
        // ======================= 核心双模式：聊天功能区 ==========================
        // =========================================================================
        
        let currentChatMode = 'eng'; // 'eng' 英文私教, 'chn' 中文助手

        const promptEng = `你是一位友好的英语母语者，正在和用户进行轻松的日常聊天。
【首要任务】：用自然、地道的英语回答问题，推进对话。
【纠错规则】：只有当用户的英语出现明显的语法或拼写错误时，你才纠错。没有明显错误，**绝对不要**纠错。
如果有错误，**必须**将中文纠错内容放在 <纠错> 和 </纠错> 标签之间，且放在回复最前。
【示例】：用户: I is very happy.  -> AI: <纠错>主语 I 后应用 am。</纠错> I am so glad to hear that! Why are you happy?`;

        const promptChn = `你是一个聪明、友善的AI助手。
请完全使用自然、流利的**中文**回答用户的所有问题。
不论用户问什么，你都直接用纯中文给予有用的帮助，态度亲切，就像朋友聊天一样。`;

        let chatHistory =[];

        // 核心：模式切换器
        function switchChatMode(mode) {
            currentChatMode = mode;
            
            // UI 高亮切换
            document.getElementById('modeBtnEng').classList.remove('active');
            document.getElementById('modeBtnChn').classList.remove('active');
            
            if (mode === 'eng') {
                document.getElementById('modeBtnEng').classList.add('active');
                document.getElementById('chatMsgInput').placeholder = "输入英语与 AI 对话...";
                chatHistory =[{ role: "system", content: promptEng }];
            } else {
                document.getElementById('modeBtnChn').classList.add('active');
                document.getElementById('chatMsgInput').placeholder = "输入中文与 AI 对话...";
                chatHistory = [{ role: "system", content: promptChn }];
            }

            // 清空并刷新聊天框开场白
            const chatLog = document.getElementById('chatLog');
            chatLog.innerHTML = '';
            
            const greeting = mode === 'eng' 
                ? `Hi! I am your AI English friend. What do you want to talk about today?<br><br><span style="font-size: 12px; color: #8e8e93;">(像朋友一样跟我聊！只有你犯了明显的错误，我才会偷偷纠正你哦。)</span>` 
                : `你好！我是你的全能中文小助手。有什么我可以帮你的吗？<br><br><span style="font-size: 12px; color: #8e8e93;">(有任何生活百科、知识问答，都可以直接问我哦！)</span>`;
            
            appendChatBubble(greeting, 'ai');
        }

        function saveApiKey() {
            const key = document.getElementById('siliconApiKey').value.trim();
            if (key.startsWith("sk-")) {
                localStorage.setItem('silicon_api_key', key);
                document.getElementById('apiKeyStatus').innerText = "✅ 保存成功！可以直接聊天了。";
                document.getElementById('apiKeyStatus').style.color = "#27ae60";
                setTimeout(() => { toggleSettings(); }, 600);
            } else { alert("API Key 格式似乎不对，通常以 sk- 开头"); }
        }

        // 核心发音器：根据当前模式自动选择语言引擎
        window.playAiSpeech = function(btnElement, langOverride = null) {
            const encodedText = btnElement.getAttribute('data-text');
            const text = decodeURIComponent(encodedText);
            
            // 如果传入了强制语言就用强制的，否则根据当前模式判断
            let langToUse = langOverride;
            if (!langToUse) {
                langToUse = (currentChatMode === 'eng') ? 'en-US' : 'zh-CN';
            }

            window.speechSynthesis.cancel(); 
            activeUtterance = new SpeechSynthesisUtterance(text);
            activeUtterance.lang = langToUse;
            activeUtterance.rate = (langToUse === 'en-US') ? 0.95 : 1.0; 
            window.speechSynthesis.speak(activeUtterance);
        };

        async function sendChatMessage(overrideText = null) {
            const inputEl = document.getElementById('chatMsgInput');
            const userText = overrideText || inputEl.value.trim();
            
            if (!userText) return;
            
            const apiKey = localStorage.getItem('silicon_api_key');
            if (!apiKey) { alert("请先展开设置，输入并保存硅基流动的 API Key！"); return; }

            // 苹果底层破冰：发送的瞬间静音骗取权限
            window.speechSynthesis.cancel();
            let unlockUtterance = new SpeechSynthesisUtterance(' ');
            unlockUtterance.volume = 0.01; 
            window.speechSynthesis.speak(unlockUtterance);

            appendChatBubble(userText, 'user');
            inputEl.value = ''; inputEl.blur(); 
            chatHistory.push({ role: "user", content: userText });
            const loadingId = appendChatBubble("⏳ 正在思考...", 'ai');

            try {
                const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: 'Qwen/Qwen2.5-7B-Instruct', messages: chatHistory, max_tokens: 350, temperature: 0.7 })
                });

                if (!response.ok) throw new Error("网络请求失败");
                const data = await response.json();
                const aiRawText = data.choices[0].message.content;

                chatHistory.push({ role: "assistant", content: aiRawText });
                renderAndSpeakAiResponse(aiRawText, loadingId);

            } catch (error) {
                console.error(error);
                updateChatBubble(loadingId, "⚠️ 发生错误，请检查网络或 API Key 是否正确。");
                chatHistory.pop(); 
            }
        }

        function renderAndSpeakAiResponse(rawText, bubbleId) {
            if (currentChatMode === 'eng') {
                // 英文模式：需要剥离中文纠错，并且只朗读英文
                let correctionText = ""; let replyText = rawText;
                const correctionMatch = rawText.match(/<纠错>([\s\S]*?)<\/纠错>/);
                if (correctionMatch) {
                    correctionText = correctionMatch[1].trim(); 
                    replyText = rawText.replace(/<纠错>[\s\S]*?<\/纠错>/, '').trim();
                }

                const englishOnly = replyText.replace(/[\u4e00-\u9fa5]/g, '').trim(); 
                const safeText = encodeURIComponent(englishOnly);

                let htmlContent = "";
                if (correctionText) { htmlContent += `<div class="chat-correction"><strong>💡 语法小贴士:</strong><br>${correctionText}</div>`; }
                
                // 传递 'en-US' 强制用英文引擎读
                htmlContent += `
                    <div class="chat-reply">
                        ${replyText}
                        <button class="btn-play-reply" data-text="${safeText}" onclick="playAiSpeech(this, 'en-US')">🔊</button>
                    </div>
                `;
                updateChatBubble(bubbleId, htmlContent);

                if (englishOnly.length > 0) {
                    window.speechSynthesis.cancel();
                    activeUtterance = new SpeechSynthesisUtterance(englishOnly);
                    activeUtterance.lang = 'en-US';
                    activeUtterance.rate = 0.95; 
                    window.speechSynthesis.speak(activeUtterance);
                }
            } else {
                // 中文模式：纯天然原话展示，并且用中文引擎朗读
                const safeText = encodeURIComponent(rawText);
                const htmlContent = `
                    <div class="chat-reply">
                        ${rawText.replace(/\n/g, '<br>')}
                        <button class="btn-play-reply" data-text="${safeText}" onclick="playAiSpeech(this, 'zh-CN')">🔊</button>
                    </div>
                `;
                updateChatBubble(bubbleId, htmlContent);

                if (rawText.length > 0) {
                    window.speechSynthesis.cancel();
                    activeUtterance = new SpeechSynthesisUtterance(rawText);
                    activeUtterance.lang = 'zh-CN'; // 强制调用中文发音引擎
                    activeUtterance.rate = 1.0; 
                    window.speechSynthesis.speak(activeUtterance);
                }
            }
        }

        function startChatVoice() {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) return alert("请在 iPhone 自带的 Safari 浏览器中使用语音功能。");
            
            window.speechSynthesis.cancel();
            let unlockUtterance = new SpeechSynthesisUtterance(' ');
            unlockUtterance.volume = 0.01;
            window.speechSynthesis.speak(unlockUtterance);

            const recognition = new SpeechRecognition(); 
            // 核心支持：根据当前模式自动切换你的麦克风听力语言！
            recognition.lang = (currentChatMode === 'eng') ? 'en-US' : 'zh-CN';
            
            const inputEl = document.getElementById('chatMsgInput'); 
            inputEl.placeholder = (currentChatMode === 'eng') ? "🎤 正在聆听你的英语..." : "🎤 正在聆听你的中文...";
            
            recognition.start();
            recognition.onresult = function(event) {
                const transcript = event.results[0][0].transcript;
                inputEl.value = transcript; 
                inputEl.placeholder = (currentChatMode === 'eng') ? "输入英语与 AI 对话..." : "输入中文与 AI 对话...";
                sendChatMessage(transcript);
            };
            recognition.onerror = function() {
                inputEl.placeholder = "⚠️ 没听清，请重试。";
                setTimeout(() => { 
                    inputEl.placeholder = (currentChatMode === 'eng') ? "输入英语与 AI 对话..." : "输入中文与 AI 对话..."; 
                }, 2000);
            };
        }

        function appendChatBubble(text, sender) {
            const chatLog = document.getElementById('chatLog'); const bubbleId = "msg-" + Date.now();
            const bubbleDiv = document.createElement('div'); bubbleDiv.className = `chat-bubble bubble-${sender}`; bubbleDiv.id = bubbleId; bubbleDiv.innerHTML = text; 
            chatLog.appendChild(bubbleDiv); chatLog.scrollTop = chatLog.scrollHeight; return bubbleId;
        }

        function updateChatBubble(bubbleId, htmlText) {
            const bubbleDiv = document.getElementById(bubbleId);
            if (bubbleDiv) { bubbleDiv.innerHTML = htmlText; document.getElementById('chatLog').scrollTop = document.getElementById('chatLog').scrollHeight; }
        }

    </script>
