import dotenv from "dotenv";
dotenv.config();

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { qdrant, ensureCollections, embed } from "../chat-ui/src/server/vector";

const DATA_DIR = path.resolve("data/oshi");

function chunkJa(s: string, max = 420, overlap = 60) {
    const out: string[] = [];
    let i = 0;
    while (i < s.length) {
        let end = Math.min(i + max, s.length);
        for (let j = end; j > i + 200; j--) {
            if ("。！？」\n".includes(s[j])) { end = j + 1; break; }
        }
        out.push(s.slice(i, end).trim());
        i = Math.max(end - overlap, i + max);
    }
    return out.filter(Boolean);
}

(async () => {
    await ensureCollections();

    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".md"));
    const points: any[] = [];

    for (const f of files) {
        const full = fs.readFileSync(path.join(DATA_DIR, f), "utf8");
        for (const [idx, chunk] of chunkJa(full).entries()) {
            const vector = await embed(chunk);
            points.push({
                id: randomUUID(), // ★ ここをUUIDに
                vector,
                payload: { file: f, idx, text: chunk }
            });
        }
    }

    if (points.length) {
        await qdrant.upsert("oshi_knowledge", { wait: true, points });
        console.log("ingested", points.length);
    } else {
        console.log("no chunks found");
    }
})();