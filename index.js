require('dotenv').config();
const express = require('express');
const db = require('./db');
const bot = require('./bot');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Basic Uptime Health Path
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', uptime: process.uptime() });
});

// Telegram Inbound Context Router Hook
app.post('/webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Initialize Database, API Bindings, & Server Framework
async function bootstrap() {
  try {
    await db.initDB();

    app.listen(PORT, async () => {
      console.log(`Server application engine actively running on port ${PORT}`);
      
      // Auto register the endpoint directly onto Telegram API clusters
      if (process.env.WEBHOOK_URL) {
        const fullHookUrl = `${process.env.WEBHOOK_URL.replace(/\/$/, '')}/webhook`;
        await bot.setWebhook(fullHookUrl);
        console.log(`Telegram API Webhook successfully targeted onto: ${fullHookUrl}`);
      } else {
        console.warn("⚠️ WEBHOOK_URL environment variable missing. Cannot register endpoint hooks.");
      }
    });
  } catch (error) {
    console.error("Critical failure during initialization:", error);
    process.exit(1);
  }
}

bootstrap();
