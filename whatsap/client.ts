import whatsapp from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'

import fs from 'fs'
import path from 'path'

const { Client, LocalAuth } = whatsapp

export function logToFile(data: object | string) {
    const logFilePath = path.join(process.cwd(), 'logs.txt');

    fs.appendFile(logFilePath, JSON.stringify(data, null, 2), (err) => {
        if (err) {
            console.error('Error writing to log file:', err);
        }
    });
}

export const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: path.join(process.cwd(), 'session'),
        clientId: "client-one"
    }),
    puppeteer: {
        // Chromium has no usable sandbox when running as root in a container.
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
});

client.on('ready', () => {
    console.log('Client is ready!');
});

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

export function start() {
    client.initialize();
}
