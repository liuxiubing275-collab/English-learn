const API_KEY = "AIzaSyCbSUSIyazgXBWxLvD-XHi0JrICP9TmIfY";
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const messagesArea = document.getElementById("messages-area");
const clearBtn = document.getElementById("clear-btn");

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
