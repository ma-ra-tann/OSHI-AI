import { useState } from "react";
import "./App.css";

function App() {
  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState([]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    setMessages((prev) => [
      ...prev,
      { from: "user", text: inputText },
      {
        from: "bot",
        text: `シンロンに投票してね🎶\n👉 [こちらをクリック](https://share.mnetplus.world/boys2planet/participants/6841494379ae5728aa69a608?hl=ja)`,
      },
    ]);
    setInputText("");
  };

  return (
    <div className="chat-container">
      <div className="message-area">
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.from}
            dangerouslySetInnerHTML={{
              __html: m.text
                .replace(/\n/g, "<br>")
                .replace(
                  /\[([^\]]+)\]\(([^)]+)\)/g,
                  '<a href="$2" target="_blank" style="color:#7fbdff;">$1</a>'
                ),
            }}
          />
        ))}
      </div>
      <form onSubmit={handleSubmit} className="input-form">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="メッセージを入力"
        />
        <button type="submit">送信</button>
      </form>
    </div>
  );
}

// ✅ これが一番最後！
export default App;