const {
  default: makeWASocket,
  useMultiFileAuthState,
  downloadMediaMessage,
  DisconnectReason
} = require("@whiskeysockets/baileys");
const fs = require("fs-extra");
const qrcode = require("qrcode-terminal");
const { execSync } = require("child_process");
const path = require("path");

const products = require("./products.json");
const faq = require("./faq.json");

async function compareWithProducts(imagePath) {
  let bestScore = 0;
  let bestProduct = null;

  for (const product of products) {
    try {
      const score = parseFloat(execSync(
        `python compare_images.py "${imagePath}" "${product.image}"`
      ).toString().trim());

      if (score > bestScore) {
        bestScore = score;
        bestProduct = product;
      }
    } catch (err) {
      console.error("Image comparison failed:", err.message);
    }
  }

  return bestScore > 0.2 ? bestProduct : null;
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const sock = makeWASocket({
    auth: state,
    browser: ["Ubuntu", "Chrome", "22.04.4"]
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      console.log("📱 Scan the QR code below to link WhatsApp:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("✅ WhatsApp connected!");
    }

    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("❌ Disconnected. Reconnecting...", { shouldReconnect });

      if (shouldReconnect) {
        startBot();
      } else {
        console.log("🛑 Session ended. Please restart manually.");
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message) return;

    const jid = msg.key.remoteJid;

    // Handle text messages
    if (msg.message.conversation) {
      const text = msg.message.conversation.toLowerCase().trim();

      // FAQ and greeting matching
      for (const entry of faq) {
        if (entry.keywords.some(k => text.includes(k))) {
          await sock.sendMessage(jid, { text: entry.reply });
          return;
        }
      }

      if (["catalog", "list", "menu"].includes(text)) {
        const catalogText = products.map(p =>
          `🛍️ *${p.name}*\n🔢 SKU: ${p.sku}\n📐 Size: ${p.dimensions}\n💰 Price: ₹${p.price}`
        ).join("\n\n");
        await sock.sendMessage(jid, { text: `📦 *Product Catalog:*\n\n${catalogText}` });
        return;
      }
    }

    // Handle image messages
    if (msg.message.imageMessage) {
      const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger: console });
      const tempPath = `temp_${Date.now()}.jpg`;
      await fs.outputFile(tempPath, buffer);

      const match = await compareWithProducts(tempPath);

      if (match) {
        const reply = `✅ *Match Found!*\n🛍️ *Product*: ${match.name}\n🔢 *SKU*: ${match.sku}\n📐 *Size*: ${match.dimensions}\n💰 *Price*: ₹${match.price}`;
        await sock.sendMessage(jid, { text: reply });
      } else {
        await sock.sendMessage(jid, {
          text: "❌ Product not recognized. Please call +91-9876543210 for assistance."
        });
      }

      await fs.remove(tempPath);
    }
  });
}

startBot();