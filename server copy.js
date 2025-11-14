import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(bodyParser.json());

// 🔐 Орчны хувьсагчид (.env файлд хадгалах)
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ✅ 1. Webhook баталгаажуулах (Facebook-аас шалгалт ирэхэд)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook баталгаажлаа ✅");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ✅ 2. Messenger-ээс ирсэн мессеж хүлээн авах
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    for (const entry of body.entry) {
      const event = entry.messaging[0];
      const sender = event.sender.id;

      if (event.message && event.message.text) {
        const userMessage = event.message.text.toLowerCase();
        console.log("👤 Хэрэглэгч:", userMessage);

        // --- 1. Хэрэв захиалга авах мессеж илгээсэн бол
        if (
          userMessage.includes("захиалга") ||
          userMessage.includes("захиалах")
        ) {
          await sendMessage(
            sender,
            "🛒 Та ямар бараа захиалах гэж байна вэ? Нэр, тоо ширхэг, хаягаа бичнэ үү."
          );
          continue;
        }

        // --- 2. Хэрэв асуулт бол ChatGPT рүү илгээнэ
        const gptReply = await askChatGPT(userMessage);
        await sendMessage(sender, gptReply);
      }
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// ✅ ChatGPT API-тай холбох функц
async function askChatGPT(message) {
  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Та Facebook Page-ийн туслах AI бот. Хэрэглэгчийн асуултад энгийн, ойлгомжтой хариул.",
          },
          { role: "user", content: message },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.data.choices[0].message.content.trim();
  } catch (err) {
    console.error("ChatGPT error:", err.message);
    return "Уучлаарай, хариу боловсруулахад алдаа гарлаа.";
  }
}

// ✅ Messenger рүү буцааж мессеж илгээх функц
async function sendMessage(senderId, text) {
  await axios.post(
    `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    {
      recipient: { id: senderId },
      message: { text },
    }
  );
}

app.listen(3000, () => console.log("🚀 Server working on port 3000"));
