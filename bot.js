const {
  default: makeWASocket,
  useMultiFileAuthState,
  downloadMediaMessage
} = require("@whiskeysockets/baileys");

const fs = require("fs-extra");
const path = require("path");
const { execSync } = require("child_process");
const qrcode = require("qrcode-terminal");

const products = require("./products.json");
const faq = require("./faq.json");

const compareWithProducts = async (receivedImagePath) => {
  let bestScore = 0;
  let bestProduct = null;

  for (const product of products) {
    try {
      const score = parseFloat(execSync(
        `python compare_images.py "${receivedImagePath}" "${product.image}"`
      ).toString().trim());

      if (score > bestScore) {
        bestScore = score;
        bestProduct = product;
      }
    } catch (err) {
      console.error("Image comparison error:", err.message);
    }
  }

  return bestScore > 0.2 ? bestProduct : null;
};

const startBot = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const sock = makeWASocket({
    auth: state,
    browser: ["Ubuntu", "Chrome", "22.04.4"]
  });

  sock.ev.on("connection.update", (update) => {
    const { qr, connection, lastDisconnect } = update;

    if (qr) {
      console.log("📱 Scan this QR Code with WhatsApp:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("✅ Bot is now connected to WhatsApp!");
    }

    if (connection === "close") {
      console.log("❌ Disconnected. Trying to reconnect...");
      startBot();
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    const jid = msg.key.remoteJid;

    // 💬 Text Messages
    if (msg.message?.conversation) {
      const text = msg.message.conversation.toLowerCase().trim();

      // 📚 FAQ Matching
      for (const entry of faq) {
        if (entry.keywords.some(k => text.includes(k))) {
          await sock.sendMessage(jid, { text: entry.reply });
          return;
        }
      }

      // 📋 Product Catalog
      if (["catalog", "list", "menu"].includes(text)) {
        const catalogText = products.map(p =>
          `🛍️ *${p.name}*\n🔢 SKU: ${p.sku}\n📐 Size: ${p.dimensions}\n💰 Price: ₹${p.price}`
        ).join("\n\n");

        await sock.sendMessage(jid, { text: `📦 *Product Catalog:*\n\n${catalogText}` });
        return;
      }
    }

    // 📷 Image Matching
    if (!msg.message?.imageMessage) return;

    const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger: console });
    const tempPath = `temp_${Date.now()}.jpg`;
    await fs.outputFile(tempPath, buffer);

    const match = await compareWithProducts(tempPath);

    if (match) {
      const reply = `✅ *Match Found!*
🛍️ *Product*: ${match.name}
🔢 *SKU*: ${match.sku}
📐 *Size*: ${match.dimensions}
💰 *Price*: ₹${match.price}`;
      await sock.sendMessage(jid, { text: reply });
    } else {
      await sock.sendMessage(jid, {
        text: "❌ Product not recognized.\n📞 Please call us at +91-9876543210 for assistance."
      });
    }

    await fs.remove(tempPath);
  });
};

startBot();
