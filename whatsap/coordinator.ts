import { callAgent } from './agent.ts'
import { client, logToFile, start } from './client.ts'

const debug = false;

const MESSAGE = debug ? 'message_create' : 'message';

client.on(MESSAGE, async message => {
    logToFile('---- message event ----');
    logToFile(message);
    const USER = message.notifyName || message.from;

    if (message.body === '!ping') {
        // send back "pong" to the chat the message was sent in
        client.sendMessage(message.from, 'pong');
        // reply back "pong" directly to the message
        message.reply('pong');
    }

    console.log('---- message from ' + USER + ' ----');
    console.log(message.body);
    if (message.body.startsWith('!ai')) {
        const request = message.body.replace('!ai', '').trim();
        const response = await callAgent(request);
        message.reply(response);
    }
});

client.on('message_create', async message => {
    logToFile('---- message-create event ----');
    logToFile(message);
    const USER = message["_data"].notifyName || message.from;

    if (message.body === '!ping') {
        // send back "pong" to the chat the message was sent in
        client.sendMessage(message.from, 'pong');
        // reply back "pong" directly to the message
        message.reply('pong');
    }

    console.log('---- message from ' + USER + ' ----');
    console.log(message.body);
    if (message.body.startsWith('!ai')) {
        const request = message.body.replace('!ai', '').trim();
        const response = await callAgent(request);
        message.reply(response);
    }
});

start();
