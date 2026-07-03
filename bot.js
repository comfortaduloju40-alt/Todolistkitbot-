const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');

// Initialize Bot Instance without internal polling engine
const bot = new TelegramBot(process.env.BOT_TOKEN);

// Main Message Routing Logic
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.trim() : '';

  if (!text) return;

  // Handle Command /start
  if (text.startsWith('/start')) {
    return bot.sendMessage(
      chatId, 
      `👋 Welcome to *TodoListKitBot*!\n\nI can help you manage your daily updates safely and efficiently.\n\n*Commands List:*\n📝 \`/add <task>\` - Add a new item\n📋 \`/list\` - Show your roadmap\n✅ \`/done <number>\` - Complete a task\n❌ \`/delete <number>\` - Remove a task\n🧹 \`/clear\` - Wipe out finished tasks`, 
      { parse_mode: 'Markdown' }
    );
  }

  // Handle Command /add
  if (text.startsWith('/add')) {
    const taskContent = text.replace('/add', '').trim();
    if (!taskContent) {
      return bot.sendMessage(chatId, "⚠️ Please specify a task description. Example: `/add Buy groceries`", { parse_mode: 'Markdown' });
    }
    await db.addTask(chatId, taskContent);
    return bot.sendMessage(chatId, `✅ Added: "${taskContent}"`);
  }

  // Handle Command /list
  if (text.startsWith('/list')) {
    return displayTodoList(chatId);
  }

  // Handle Command /done
  if (text.startsWith('/done')) {
    const match = text.match(/\/done\s+(\d+)/);
    if (!match) return bot.sendMessage(chatId, "⚠️ Usage syntax: `/done <task_number>`", { parse_mode: 'Markdown' });
    
    const index = parseInt(match[1], 10) - 1;
    const completedTask = await db.markDone(chatId, index);
    
    if (!completedTask) return bot.sendMessage(chatId, "❌ Invalid item tracking number. Check your list via `/list`.");
    return bot.sendMessage(chatId, `🎉 Marked complete: "${completedTask}"`);
  }

  // Handle Command /delete
  if (text.startsWith('/delete')) {
    const match = text.match(/\/delete\s+(\d+)/);
    if (!match) return bot.sendMessage(chatId, "⚠️ Usage syntax: `/delete <task_number>`", { parse_mode: 'Markdown' });
    
    const index = parseInt(match[1], 10) - 1;
    const removedTask = await db.deleteTask(chatId, index);
    
    if (!removedTask) return bot.sendMessage(chatId, "❌ Invalid item tracking number.");
    return bot.sendMessage(chatId, `🗑️ Deleted: "${removedTask}"`);
  }

  // Handle Command /clear
  if (text.startsWith('/clear')) {
    const counts = await db.clearCompleted(chatId);
    return bot.sendMessage(chatId, `🧹 Cleaned up ${counts} completed items from your logs.`);
  }
});

// Callback Queries Processing Framework (Inline Keyboards)
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const [action, indexStr] = query.data.split('_');
  const index = parseInt(indexStr, 10);

  // Acknowledge the callback internally immediately to prevent UI lag
  bot.answerCallbackQuery(query.id);

  if (action === 'done') {
    await db.markDone(chatId, index);
  } else if (action === 'del') {
    await db.deleteTask(chatId, index);
  }

  // Re-render the existing view layout dynamically 
  return displayTodoList(chatId, messageId);
});

// Helper component to construct and refresh task listings
async function displayTodoList(chatId, updateMessageId = null) {
  const tasks = await db.getTasks(chatId);

  if (tasks.length === 0) {
    const emptyMsg = "🎉 Your todo list is completely clean! Use `/add <task>` to get started.";
    if (updateMessageId) {
      return bot.editMessageText(emptyMsg, { chat_id: chatId, message_id: updateMessageId });
    }
    return bot.sendMessage(chatId, emptyMsg);
  }

  let formattedText = "📋 *Your Current Tasks:*\n\n";
  const inlineKeyboard = [];

  tasks.forEach((item, idx) => {
    const displayNum = idx + 1;
    const badge = item.status === 'completed' ? '✅ [Done] ' : '⏳ ';
    formattedText += `${displayNum}. ${badge}_${item.task}_\n`;

    // Only add actions to inline rows if items are not marked completed
    if (item.status !== 'completed') {
      inlineKeyboard.push([
        { text: `✅ Complete #${displayNum}`, callback_data: `done_${idx}` },
        { text: `🗑️ Delete #${displayNum}`, callback_data: `del_${idx}` }
      ]);
    }
  });

  const options = {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: inlineKeyboard }
  };

  if (updateMessageId) {
    options.chat_id = chatId;
    options.message_id = updateMessageId;
    return bot.editMessageText(formattedText, options).catch(err => {
      // Catch errors if users tap actions rapidly without data state modifications
      if (!err.message.includes('message is not modified')) console.error(err);
    });
  }

  return bot.sendMessage(chatId, formattedText, options);
}

module.exports = bot;
