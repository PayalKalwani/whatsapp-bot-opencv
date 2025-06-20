const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const { ImageMatcher } = require('./image-matcher');
const express = require('express');

// Initialize Baileys
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('connection closed due to', lastDisconnect.error, ', reconnecting:', shouldReconnect);
      if (shouldReconnect) {
        startBot();
      }
    } else if (connection === 'open') {
      console.log('✅ WhatsApp connected!');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const messageType = Object.keys(msg.message)[0];

    if (messageType === 'imageMessage') {
      const buffer = await sock.downloadMediaMessage(msg);
      const matcher = new ImageMatcher('./product-database');
      const match = matcher.findBestMatch(buffer);

      if (match && match.confidence > 0.6) {
        const productInfo = match.product;
        await sock.sendMessage(sender, {
          text: `🔍 Match found:\n\n🛍️ *Name:* ${productInfo.name}\n🆔 *SKU:* ${productInfo.sku}\n📏 *Dimensions:* ${productInfo.dimensions}\n💲 *Price:* ${productInfo.price}`,
        });
      } else {
        await sock.sendMessage(sender, { text: '❌ No matching product found.' });
      }
    } else if (messageType === 'conversation') {
      const text = msg.message.conversation.toLowerCase();
      if (text.includes('hello') || text.includes('hi')) {
        await sock.sendMessage(sender, { text: '👋 Hello! Send me a product image and I’ll match it for you.' });
      } else if (text.includes('support')) {
        await sock.sendMessage(sender, { text: '📞 For support, call us at: tel:+91xxxxxxxxxx' });
      } else if (text.includes('catalog')) {
        await sock.sendMessage(sender, { text: '📘 Our product catalog is available at: https://your-website.com/catalog.pdf' });
      } else {
        await sock.sendMessage(sender, { text: '🤖 I can help match product images or answer basic queries. Try sending a photo!' });
      }
    }
  });
}

startBot();

// --- ✅ Add Express health check server for Render ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (_, res) => {
  res.send('✅ WhatsApp bot is running');
});

app.listen(PORT, () => {
  console.log(`🚀 Health check server running at http://localhost:${PORT}`);
});