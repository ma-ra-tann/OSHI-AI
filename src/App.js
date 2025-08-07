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
      { from: "bot", text: "これは定型文の返答です！" },
    ]);
    setInputText("");
  };

  return (
    <div className="chat-container">
      <div className="message-area">
        {messages.map((m, i) => (
          <div key={i} className={m.from}>
            {m.text}
          </div>
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

export default App;