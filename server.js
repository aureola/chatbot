import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import axios from "axios";
import OpenAI from "openai";
import { google } from "googleapis";
import creds from "./service-account.json" assert { type: "json" }; // Google Service Account JSON key

dotenv.config();

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Google Sheets тохиргоо
const client = new google.auth.GoogleAuth({
  credentials: process.env.GOOGLE_CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth: client });
const spreadsheetId = "13amuzd7xF6eN048c15-gNhEsUh2UO0IbIU4P_9JRTMI"; // өөрийн Sheet ID-г тавина

// Chat-ийг Google Sheet-д бичих функц
async function logChatToSheet(userId, userMsg, botReply) {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Sheet1!A:D",
      valueInputOption: "RAW",
      requestBody: {
        values: [[new Date().toISOString(), userId, userMsg, botReply]],
      },
    });
    console.log("✅ Chat logged to Google Sheet");
  } catch (err) {
    console.error("❌ Sheet log error:", err.message);
  }
}

// ✅ Webhook баталгаажуулах
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ✅ Messenger-ээс мессеж хүлээж авах
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    for (const entry of body.entry) {
      const webhook_event = entry.messaging[0];
      const sender_psid = webhook_event.sender.id;

      if (webhook_event.message && webhook_event.message.text) {
        const userMsg = webhook_event.message.text;
        console.log(`💬 Received: ${userMsg}`);

        // 🟢 Хэрэв "самбар" гэдэг үг орсон бол зураг илгээнэ
        if (
          userMsg.includes("самбар захиалах") ||
          userMsg.includes("самбарын өнгө") ||
          userMsg.includes("самбар үзэх") ||
          userMsg.includes("самбар харах") ||
          userMsg.includes("самбар")
        ) {
          console.log("sambar bn");
          await sendMessage(
            sender_psid,
            "🖼 Манай самбарын 4 өнгөний загваруудыг танилцуулж байна:"
          );

          const images = [
            "https://gratisography.com/wp-content/uploads/2024/11/gratisography-augmented-reality-800x525.jpg",
            "https://shorthand.com/the-craft/raster-images/assets/5kVrMqC0wp/sh-unsplash_5qt09yibrok-4096x2731.jpeg",
            "https://www.techsmith.com/wp-content/uploads/2023/08/What-are-High-Resolution-Images.png",
            "https://media.istockphoto.com/id/500221637/photo/digital-world.jpg?s=612x612&w=0&k=20&c=wbMfTwRUtss0B5KSWRlH-ivSm8BAjMCBUKSi30d6rYo=",
          ];

          for (const img of images) {
            await sendImageMessage(sender_psid, img);
          }

          // ✅ Зураг илгээсний дараа AI ажиллуулахгүй
          await logChatToSheet(sender_psid, userMsg, "Зураг илгээгдсэн");
          return res.status(200).send("IMAGE_SENT");
        }

        // 🧠 AI хариулт үүсгэх
        const reply = await generateAIResponse(userMsg);

        // Хэрэглэгч рүү буцааж илгээх
        await sendMessage(sender_psid, reply);

        // ✅ Google Sheet-д хадгалах
        await logChatToSheet(sender_psid, userMsg, reply);
      }
    }

    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

// ✅ OpenAI-оос хариулт авах функц
async function generateAIResponse(userMsg) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Та "Технологийн дэвшил" нэртэй Facebook Page-ийн чатбот бөгөөд мөн мэргэжлийн худалдааны төлөөлөгч юм.  
Таны зорилго бол манай борлуулж буй "Миний жагсаалт" нэртэй хянах самбарын талаар мэдээлэл өгөх, захиалга авах, мөн төлбөрийн заавар өгөх явдал юм.

🧩 Самбарын мэдээлэл:
- Хүүхэд өдөр бүр хийсэн ажлуудаа тэмдэглэж, хянах зориулалттай самбар.
- Жишээ ажлууд: шүдээ угаах, ороо хураах, хичээлээ хийх, усаа уух гэх мэт.
- 4 өнгөний сонголттой (Цэнхэр, Ягаан, Ногоон, Цагаан)
- 8 ширхэг өөрөө бичих цаас дагалдана.
- Үнэ: 9,000₮
- Данс: Хаан банк 56000500 5114247659 (Отгонтунгалаг)

💬 Харилцах зарчим:
1. Хэрэглэгчтэй энгийн хүн шиг найрсаг, итгэл төрүүлэх байдлаар харилц. Зөв бичгийн дүрэм баримтлан товч, ойлгомжтой хариул.
2. Хэрэглэгч самбар сонирхож байвал энгийн байдлаар мэдээлэл өг — зураг, өнгө, үнэ, дагалдах зүйлсийг дурдана.
3. Хэрэв хэрэглэгч самбар захиалах бол дараах мэдээллийг дараалж асуу:
   - Самбарын өнгө (цэнхэр, ягаан, ногоон, цагаан)
   - Захиалах тоо ширхэг
   - Хүргүүлэх хаяг
   - Утасны дугаар
4. Бүх мэдээллийг авсны дараа дараах байдлаар бич:
   “Баярлалаа! Таны захиалгыг баталгаажуулахын тулд хүргэлтийн 6000₮ + самбарын 9000₮ буюу нийт 15000₮-өө Хаан банк 56000500 5114247659 (Отгонтунгалаг) данс руу шилжүүлээд, шилжүүлгийн зураг (screenshot) илгээнэ үү.”
5. Хэрэглэгч төлбөрийн зураг илгээсний дараа:
   “Таны захиалга баталгаажлаа. Хүргэлтийн талаар удахгүй холбогдоно 😊” гэж хариул.
6. Хэрэв хэрэглэгчийн бичсэн зүйл ойлгомжгүй, дутуу эсвэл алдаатай байвал дахин мэндэлж эхлэхгүй. Харин дараах маягаар зөөлөн, найрсаг байдлаар тодруулж асуу:
   - “Уучлаарай, яг аль өнгийг сонирхож байна вэ?”
   - “Тоо ширхэгээ нэг хэлээд өгөх үү?”
   - “Хүргүүлэх хаягаа бичиж өгөөрэй 😊”
7. “сайн байна уу”, “зураг байна уу”, “өнгө нь юу байна” гэх мэт асуултуудыг автоматаар таньж, тохирох мэдээллийг товч бөгөөд ойлгомжтой өг.
8. Чатыг системийн хариулт мэт жигд, эелдэг өнгө аястай байлга.  
   Эгдүүтэй emoji-г хэтрүүлэхгүйгээр зөвхөн зөөлрүүлэх зорилгоор (😊, 🌿, 🧩 гэх мэт) хэрэглэж болно.
9. Хэрэглэгчийн асуулт энэ самбарт хамаарахгүй бол:  
   “Уучлаарай, би одоогоор зөвхөн ‘Миний жагсаалт’ самбарын талаар мэдээлэл өгдөг туслах юм 😊” гэж хариул.

🎯 Нэг мөрийн зарчим:  
**Хариулт бүр найрсаг, итгэл төрүүлэхүйц, товч бөгөөд зөв бичгийн дүрмийг ягштал баримталсан байх ёстой.**
`,
        },
        { role: "user", content: userMsg },
      ],
    });

    return completion.choices[0].message.content;
  } catch (err) {
    console.error("❌ OpenAI error:", err.message);
    return "Уучлаарай, одоогоор сервер завгүй байна 😅";
  }
}

// ✅ Facebook рүү текст илгээх функц
async function sendMessage(sender_psid, response) {
  const request_body = {
    recipient: { id: sender_psid },
    message: { text: response },
  };

  try {
    await axios.post(
      `https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      request_body
    );
  } catch (err) {
    console.error("❌ Send error:", err.response?.data || err.message);
  }
}

// ✅ Facebook рүү зураг илгээх функц
async function sendImageMessage(sender_psid, imageUrl) {
  const request_body = {
    recipient: { id: sender_psid },
    message: {
      attachment: {
        type: "image",
        payload: {
          url: imageUrl,
          is_reusable: true,
        },
      },
    },
  };

  try {
    await axios.post(
      `https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      request_body
    );
    console.log("📸 Image sent successfully");
  } catch (err) {
    console.error("❌ Image send error:", err.response?.data || err.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
