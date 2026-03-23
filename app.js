const API_KEY = "AIzaSyCbSUSIyazgXBWxLvD-XHi0JrICP9TmIfY";
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const messagesArea = document.getElementById("messages-area");
const clearBtn = document.getElementById("clear-btn");
const voiceBtn = document.getElementById("voice-btn");

const DEFAULT_HISTORY = [
    {
        role: "user",
        parts: [{ text: "You are an English dialogue tutor. Your goal is to help me practice conversational English. You will reply with natural, concise, and helpful responses, correcting my grammar gently if needed, and keeping the conversation moving by asking questions or sharing thoughts." }]
    },
    {
        role: "model",
        parts: [{ text: "Hello! I am your English dialogue tutor. Let's practice some English today. What would you like to talk about?" }]
    }
];

let chatHistory = [];

// Ensure voices are loaded (for Chrome/Safari async voice loading)
let synthVoices = [];
if ('speechSynthesis' in window) {
    speechSynthesis.onvoiceschanged = () => {
        synthVoices = window.speechSynthesis.getVoices();
    };
}

// Initialize UI and Load Memory
window.onload = () => {
    const saved = localStorage.getItem("englishTutorHistory");
    if (saved) {
        try {
            chatHistory = JSON.parse(saved);
            if (!Array.isArray(chatHistory) || chatHistory.length < 2) throw new Error();
        } catch(e) {
            chatHistory = JSON.parse(JSON.stringify(DEFAULT_HISTORY));
        }
    } else {
        chatHistory = JSON.parse(JSON.stringify(DEFAULT_HISTORY));
    }
    
    renderHistory();
    chatInput.focus();
};

// -- Speech Recognition (STT) Setup --
window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isRecording = false;

if (window.SpeechRecognition) {
    recognition = new window.SpeechRecognition();
    recognition.lang = 'en-US'; // Set to English for pronunciation practice
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = function() {
        isRecording = true;
        voiceBtn.classList.add("recording");
        chatInput.placeholder = "Listening (speak clearly)...";
    };

    recognition.onresult = function(event) {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
        }
        chatInput.value = transcript;
        chatInput.style.height = "auto";
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
    };

    recognition.onerror = function(event) {
        console.error("Speech error:", event.error);
        if (event.error === 'not-allowed') {
            alert("无法访问麦克风😢 请确保：\n1. 你的浏览器允许了本网页的麦克风权限。\n2. 你不是在微信/QQ等内置浏览器打开的（请复制链接到 Safari或系统自带浏览器 中打开）。");
        } else if (event.error !== 'no-speech') {
            alert("麦克风发生错误: " + event.error);
        }
        stopRecording();
    };

    recognition.onend = function() {
        stopRecording();
    };
} else {
    if(voiceBtn) voiceBtn.style.opacity = "0.5";
}

function stopRecording() {
    if (isRecording) {
        isRecording = false;
        if(recognition) recognition.stop();
        voiceBtn.classList.remove("recording");
        chatInput.placeholder = "Type your English message..."; // Reset to normal
    }
}

// Click to toggle recording
if (voiceBtn) {
    voiceBtn.addEventListener("click", () => {
        if (!recognition) return alert("Your browser does not support native voice recognition. Please use Edge or Chrome.");
        if (isRecording) {
            stopRecording();
        } else {
            // Stop AI currently speaking
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            chatInput.value = "";
            try { recognition.start(); } catch(e) {}
        }
    });
}

function renderHistory() {
    messagesArea.innerHTML = "";
    // Skip the first system prompt (index 0)
    for (let i = 1; i < chatHistory.length; i++) {
        const msg = chatHistory[i];
        const isAi = msg.role === "model";
        addMessage(msg.parts[0].text, isAi ? "ai" : "user");
    }
}

function saveHistory() {
    localStorage.setItem("englishTutorHistory", JSON.stringify(chatHistory));
}

// Clear memory
clearBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to clear your chat history and start a new conversation?")) {
        localStorage.removeItem("englishTutorHistory");
        chatHistory = JSON.parse(JSON.stringify(DEFAULT_HISTORY));
        renderHistory();
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
});

// Adjust textarea height dynamically
chatInput.addEventListener("input", function() {
    this.style.height = "auto";
    let newHeight = Math.min(this.scrollHeight, 120);
    this.style.height = newHeight + "px";
});

// Key events
chatInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
});

sendBtn.addEventListener("click", handleSend);

async function handleSend() {
    const text = chatInput.value.trim();
    if (!text) return;

    // Interrupt any ongoing speech
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    // Reset UI
    chatInput.value = "";
    chatInput.style.height = "auto";
    sendBtn.disabled = true;

    // 1. Add User Message
    addMessage(text, "user");
    chatHistory.push({ role: "user", parts: [{ text: text }] });
    saveHistory();

    // 2. Show Loading Indicator
    const loadingId = addLoadingIndicator();

    // 3. Make API Call to Gemini
    try {
        const responseText = await getGeminiResponse();
        
        removeLoadingIndicator(loadingId);
        
        // 4. Add AI Message
        addMessage(responseText, "ai");
        chatHistory.push({ role: "model", parts: [{ text: responseText }] });
        saveHistory();
        
        // 5. Speak out the response
        speakText(responseText);
        
    } catch (error) {
        removeLoadingIndicator(loadingId);
        addMessage(`API Error: ${error.message}`, "ai");
        console.error(error);
        chatHistory.pop();
        saveHistory();
    } finally {
        sendBtn.disabled = false;
        chatInput.focus();
    }
}

async function getGeminiResponse() {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
    
    const payload = {
        contents: chatHistory,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 256,
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error ? data.error.message : `API error: ${response.status}`);
    }
    return data.candidates[0].content.parts[0].text;
}

// Text to Speech Function
function speakText(text) {
    if (!('speechSynthesis' in window)) return;
    
    // Create new speech utterance
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    
    // Select an English voice if available
    let voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) voices = synthVoices;
    
    if (voices.length > 0) {
        // Try to find a high quality native-sounding English voice
        let enVoice = voices.find(v => v.lang.startsWith('en-') && (v.name.includes('Google') || v.name.includes('Premium') || v.name.includes('Samantha')));
        if (!enVoice) {
            enVoice = voices.find(v => v.lang.startsWith('en-'));
        }
        if (enVoice) {
            utterance.voice = enVoice;
        }
    }
    
    window.speechSynthesis.speak(utterance);
}

// UI Helpers
function addMessage(text, sender) {
    const msgBox = document.createElement("div");
    msgBox.classList.add("message-box", sender);
    
    const bubble = document.createElement("div");
    bubble.classList.add("bubble");
    bubble.innerHTML = text.replace(/\n/g, '<br>');
    
    const timestamp = document.createElement("div");
    timestamp.classList.add("timestamp");
    const now = new Date();
    timestamp.innerText = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    msgBox.appendChild(bubble);
    msgBox.appendChild(timestamp);
    messagesArea.appendChild(msgBox);
    scrollToBottom();
}

function addLoadingIndicator() {
    const id = "loading-" + Date.now();
    const msgBox = document.createElement("div");
    msgBox.classList.add("message-box", "ai");
    msgBox.id = id;
    
    const bubble = document.createElement("div");
    bubble.classList.add("bubble", "typing-indicator");
    bubble.innerHTML = `
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
    `;
    
    msgBox.appendChild(bubble);
    messagesArea.appendChild(msgBox);
    scrollToBottom();
    return id;
}

function removeLoadingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function scrollToBottom() {
    setTimeout(() => {
        messagesArea.scrollTo({
            top: messagesArea.scrollHeight,
            behavior: "smooth"
        });
    }, 10);
}
