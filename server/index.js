
const fs = require("fs");
const path = require("path");

const PROMPT_DIR = path.resolve(__dirname, "..", "data", "oshi");
// keigo -> keigo.md などへマッピング
const FILEMAP = { keigo: "keigo.md", ruki: "ruki.md", nobu: "nobu.md" };

// シンプルな読み込み＋キャッシュ
const promptCache = new Map();
async function getCharacterPrompt(key) {
  const file = FILEMAP[key];
  if (!file) return null;

  // キャッシュを無効化して常に最新のファイルを読み込む
  // if (promptCache.has(key)) return promptCache.get(key);

  const full = path.join(PROMPT_DIR, file);
  try {
    const text = await fs.promises.readFile(full, "utf8");
    console.log(`📂 ${key}.md からプロンプトを読み込み: ${text.length}文字`);
    promptCache.set(key, text);
    return text;
  } catch (e) {
    console.error("prompt load error:", e);
    return null;
  }
}
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const { QdrantClient } = require('@qdrant/js-client-rest');

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

// ===== OpenAI & Qdrant 基本設定 =====
const DEFAULT_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-large";
const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
const QDRANT_COLLECTION = "oshi_knowledge";

const qdrant = new QdrantClient({ url: QDRANT_URL });

// OpenAI クライアント（.envのキーがあれば作る）
let openai = null;
if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-api-key-here') {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ===== フォールバック用簡易プロンプト（.mdファイルが読めない時の予備） =====
const FALLBACK_PROMPTS = {
  keigo: `あなたはJO1の佐藤景瑚です。天然で明るく「〜やん」「〜かな？」という口調で話してください。`,
  ruki: `あなたはJO1の白岩瑠姫です。甘い王子様キャラで「〜だよ♡」「君」という口調で話してください。`,
  nobu: `あなたは千鳥のノブです。岡山弁で「〜じゃ！」「クセがすごい！」という口調で話してください。`
};

// ===== キャラクター別デモ返答 =====
function generateDemoResponse(message, character = "keigo") {
  const characterResponses = {
    keigo: {
      greeting: [
        "やっほー！今日も元気やん？何か聞きたいこととかあるかな？",
        "おはよ〜！会えて嬉しいやん！今日何して遊ぶ？",
        "よっ！僕と話すん？やばっ、嬉しいわ〜",
        "うぇーい！来てくれてありがとうやん！話そうや〜！"
      ],
      default: [
        "え〜なにそれ！めっちゃ気になるやん！もっと詳しく教えて〜",
        "やばっ！それめっちゃ面白そうやん！続き聞かせて〜",
        "まじ？それってどういうこと？気になるわ〜",
        "うわ〜それやばくない？もっと話聞きたいやん！"
      ]
    },
    ruki: {
      greeting: [
        "こんにちは♡瑠姫だよ〜。君と話せて嬉しいな♡",
        "やあ♡今日も可愛い君に会えて幸せだよ♡",
        "こんにちは、お姫様♡今日はどんなお話をしてくれるのかな？",
        "君と過ごす時間が一番大切だよ♡何でも聞かせて？"
      ],
      default: [
        "それは素敵だね♡君のことをもっと知りたいよ♡",
        "君の話はいつも興味深いよ♡続きを聞かせてくれる？",
        "そんな君がとても魅力的だよ♡詳しく教えて？",
        "君といると時間を忘れちゃうよ♡もっとお話ししよう♡"
      ]
    },
    nobu: {
      greeting: [
        "おい！ノブじゃ！何かクセのある話でもしようか！",
        "よっしゃ！千鳥のノブじゃ！今日もテンション上がっとるで〜！",
        "おう！ワシと話すんか！クセがすごい話期待しとるで！",
        "やっほ〜！ノブじゃ！何かボケでもかましてみいや！"
      ],
      default: [
        "それはクセがすごいじゃないか！どういうことじゃ？",
        "おい、それマジか！ツッコミどころ満載じゃないか！",
        "ちょっと待て、それはおかしいじゃろ！詳しく聞かせてくれ！",
        "クセがすごい！そんな話聞いたことないで〜！"
      ]
    }
  };

  const responses = characterResponses[character] || characterResponses.keigo;

  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes('こんにちは') || lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('やっほ')) {
    return responses.greeting[Math.floor(Math.random() * responses.greeting.length)];
  } else {
    return responses.default[Math.floor(Math.random() * responses.default.length)];
  }
}

// ===== Embedding + Qdrant 検索（RAG） =====
async function embedText(text, apiKey) {
  // そのリクエストで渡されたキーを優先。無ければ .env のキー
  const client = new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY });
  const out = await client.embeddings.create({
    model: EMBED_MODEL,
    input: text
  });
  return out.data[0].embedding;
}

async function retrieveContext(query, apiKey) {
  const vector = await embedText(query, apiKey);
  const hits = await qdrant.search(QDRANT_COLLECTION, {
    vector,
    limit: 6,
    with_payload: true,
    score_threshold: 0.2 // 低すぎるノイズを弾く
  });
  // スコアの高い順にテキスト連結（長すぎ防止で3,000字に切る）
  const ctx = hits
    .map(h => `- ${h.payload?.text || ''}（出典: ${h.payload?.file}）`)
    .join('\n')
    .slice(0, 3000);
  return ctx;
}

// ===== チャットAPI =====

app.post('/api/chat', async (req, res) => {
  const { message, useOpenAI = false, apiKey = null, character, history = [] } = req.body;

  // キャラクターが未定義の場合はkeigoをデフォルトに
  const selectedCharacter = character || "keigo";

  console.log('🔍 受信したリクエスト:', { 
    message: message?.substring(0, 30) + '...', 
    useOpenAI, 
    character_raw: character,
    character_selected: selectedCharacter 
  });

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'メッセージが必要です' });
  }

  try {
    // 使う OpenAI クライアントを決定
    let tempOpenAI = openai;
    if (apiKey && apiKey !== 'your-api-key-here') {
      tempOpenAI = new OpenAI({ apiKey });
    }

    if (useOpenAI && tempOpenAI) {
      try {
        // ★ RAG：推しメモから文脈取得
        const context = await retrieveContext(message, apiKey || process.env.OPENAI_API_KEY);

        // ★ メモリ検索：過去の会話履歴から関連情報を取得
        let memoryContext = '';
        try {
          const userId = 'default-user';
          const vector = await embedText(message, apiKey || process.env.OPENAI_API_KEY);
          const memoryHits = await qdrant.search('oshi_memory', {
            vector,
            limit: 3,
            with_payload: true,
            score_threshold: 0.3
          });
          memoryContext = memoryHits
            .map(h => `[過去の会話] ${h.payload?.content || ''}`)
            .join('\n')
            .slice(0, 1000);
        } catch (memoryError) {
          console.warn('Memory search failed:', memoryError);
        }
        // ① キャラクター別プロンプトを取得
        const filePrompt = await getCharacterPrompt(selectedCharacter);
        console.log('📁 ファイルから読み込んだプロンプト:', filePrompt ? filePrompt.substring(0, 100) + '...' : 'なし');

        const systemPrompt =
          (filePrompt && filePrompt.trim()) ||
          FALLBACK_PROMPTS[selectedCharacter] ||
          FALLBACK_PROMPTS.keigo;
        console.log('🎭 選択されたキャラクター:', selectedCharacter);
        console.log('📝 最終的に使用するプロンプト:', systemPrompt.substring(0, 100) + '...');

        const fullContext = [
          context && `[推し知識]\n${context}`,
          memoryContext && `[会話履歴]\n${memoryContext}`
        ].filter(Boolean).join('\n\n') || '（該当なし）';

        // 直近の履歴を（長すぎない範囲で）挿入
        const trimmedHistory = Array.isArray(history)
          ? history
            .slice(-8)
            .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          : [];

        const messagesForOpenAI = [
          { role: "system", content: systemPrompt },
          // RAGの知識は user か system の補足として別メッセージに分けると口調が崩れにくい
          ...(fullContext && fullContext !== '（該当なし）'
            ? [{ role: "system", content: `【参考情報】\n${fullContext}` }]
            : []),
          ...trimmedHistory,                 // ← ここで履歴を注入（role: user/assistant）
          { role: "user", content: message } // ← 今回の発話
        ];

        const completion = await tempOpenAI.chat.completions.create({
          model: DEFAULT_CHAT_MODEL,
          messages: messagesForOpenAI,
          temperature: 0.9,
          max_tokens: 200
        });
        const aiResponse = completion.choices?.[0]?.message?.content || "……";

        // ★ メモリ機能：会話を保存（バックグラウンドで実行）
        try {
          const { maybeStoreMemory } = await import('../chat-ui/src/server/memory.js');
          const userId = 'default-user'; // 実際のアプリではセッションIDなどを使用
          const transcript = `ユーザー: ${message}\n${selectedCharacter}: ${aiResponse}`;
          maybeStoreMemory(userId, transcript).catch(console.error);
        } catch (memoryError) {
          console.warn('Memory function not available:', memoryError);
        }

        res.json({ message: aiResponse, isDemo: false });
      } catch (openaiError) {
        console.error('OpenAI/Qdrant Error:', openaiError);
        const demoResponse = generateDemoResponse(message, selectedCharacter);
        res.json({
          message: demoResponse,
          isDemo: true,
          error: 'RAG/OpenAIでエラー。デモモードで応答しています。'
        });
      }
    } else {
      // デモモード
      const demoResponse = generateDemoResponse(message, character);
      res.json({ message: demoResponse, isDemo: true });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// APIキー検証
app.post('/api/validate-key', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.json({ valid: false, message: 'APIキーが必要です' });

  try {
    const testOpenAI = new OpenAI({ apiKey });
    await testOpenAI.chat.completions.create({
      model: DEFAULT_CHAT_MODEL,
      messages: [{ role: "user", content: "test" }],
      max_tokens: 1
    });
    res.json({ valid: true, message: 'APIキーが有効です！' });
  } catch (error) {
    res.json({ valid: false, message: 'APIキーが無効です' });
  }
});

// ヘルスチェック
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: openai ? 'openai' : 'demo',
    hasEnvKey: !!process.env.OPENAI_API_KEY
  });
});

app.listen(PORT, () => {
  console.log(`AI Chat Server running on http://localhost:${PORT}`);
  console.log(`Mode: ${openai ? 'OpenAI API' : 'Demo'}`);
  if (!openai) {
    console.log('💡 OpenAI APIキーを設定するには、.envファイルのOPENAI_API_KEYを更新してください');
  }
});