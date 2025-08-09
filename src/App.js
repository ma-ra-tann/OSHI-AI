import { useState } from "react";
import "./App.css";

function App() {
  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState([]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    // 先に自分のメッセージを表示
    setMessages(prev => [...prev, { from: "user", text: inputText }]);

    try {
      const res = await fetch(`http://localhost:4000/api/search?name=${encodeURIComponent(inputText)}`);
      const data = await res.json();
      const hit = data.hits?.[0];

      setMessages(prev => [
        ...prev,
        hit
          ? { from: "bot", text: `「${hit.name}」に投票してね🎶\n👉 [こちらをクリック](${hit.url})` }
          : { from: "bot", text: `該当が見つからなかったよ…\n公式一覧から探してね👇\n👉 [BOYS PLANET 参加者一覧](https://share.mnetplus.world/boys2planet/participants?hl=ja)` }
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { from: "bot", text: "検索でエラーが出たよ…あとで再試行してね🙏" }
      ]);
    }

    setInputText("");
  };
  return (
    <div className="chat-container">
      <div className="profile-header">
        <img 
          src="https://thetv.jp/i/tl/100/0045/1000045911_r.jpg?w=646" 
          alt="マツコ・デラックス" 
          className="profile-image"
        />
        <h2>マツコ・デラックス</h2>
      </div>
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