const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs').promises;
const path = require('path');
const { dbQuery, dbRun } = require('./db');
const QRCode = require('qrcode');

let ioInstance; 
let botStatus = "disconnected";

function setIo(io) {
    ioInstance = io;
    ioInstance.on('connection', (socket) => {
        socket.emit('bot_status', botStatus);
    });
}

const receiptsFolder = path.join(__dirname, "receipts");
const fsSync = require('fs');
if (!fsSync.existsSync(receiptsFolder)) fsSync.mkdirSync(receiptsFolder);


const client = new Client({

    authStrategy: new LocalAuth(),

    puppeteer: {

        headless: true,

        args: ['--no-sandbox', '--disable-setuid-sandbox'],

        protocolTimeout: 120000,

        timeout: 0

    }

});

// --- أحداث الحالة (Status Events) ---

client.on('qr', qr => {
    botStatus = "qr_ready";
    if (ioInstance) ioInstance.emit('bot_status', "qr_ready");
    
    QRCode.toDataURL(qr, { width: 300 }, (err, url) => {
        if(err) console.error("Error generating QR:", err);
        else if(ioInstance) ioInstance.emit('qr', url);
    });
});

client.on('ready', () => {
    botStatus = "connected";
    if(ioInstance) ioInstance.emit('bot_status', "connected");
    console.log("WhatsApp Bot Ready ✅");
});

client.on('disconnected', async (reason) => {
    botStatus = "disconnected";
    if (ioInstance) ioInstance.emit('bot_status', "disconnected");
    console.log("WhatsApp Bot Disconnected ❌:", reason);
    
    // محاولة إعادة التهيئة لجلب QR جديد تلقائياً
    try {
        await client.destroy();
        client.initialize();
    } catch (e) {
        console.error("خطأ أثناء إعادة تشغيل العميل:", e);
    }
});

// --- معالجة الرسائل (Message Logic) ---

function arabicToEnglishNumbers(str) {
    const arabicNums = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
    return str.toString().replace(/[٠-٩]/g, d => arabicNums.indexOf(d));
}

client.on('message', async msg => {
    try {
        const user = msg.from;
        let text = msg.body ? msg.body.trim() : "";
        text = arabicToEnglishNumbers(text);

        const rows = await dbQuery("SELECT data FROM sessions WHERE user_id = ?", [user]);
        let session = rows.length > 0 ? JSON.parse(rows[0].data) : null;

        if(text.toLowerCase() === "menu"){
            await dbRun("DELETE FROM sessions WHERE user_id = ?", [user]);
            msg.reply(`القائمة تم إعادة عرضها. أرسل أي رسالة لبدء العملية.`);
            return;
        }

        if(!session){
            msg.reply(`مرحباً\n\n1 - تسجيل دفعة\n2 - تقديم شكوى`);
            await dbRun("INSERT OR REPLACE INTO sessions (user_id, data) VALUES (?, ?)", [user, JSON.stringify({step:0})]);
            return;
        }

        if(text === "1" && session.step === 0){
            session.step = 1;
            await dbRun("UPDATE sessions SET data = ? WHERE user_id = ?", [JSON.stringify(session), user]);
            msg.reply("اسم صاحب الاشتراك المسجل لدينا:");
            return;
        }

        if(session.step >= 1 && session.step <= 4) {
            if(session.step === 1) { session.name = text; msg.reply("اسم صاحب الحساب الذي تم التحويل منه:"); }
            else if(session.step === 2) { session.sender = text; msg.reply("قيمة الدفعة:"); }
            else if(session.step === 3) { session.amount = text; msg.reply("تاريخ الدفعة (مثال: 16-3-2026):"); }
            else if(session.step === 4) { session.datePayment = text; msg.reply("أرسل صورة الإشعار إن وجدت أو اكتب (لا يوجد):"); }
            
            session.step += 1;
            await dbRun("UPDATE sessions SET data = ? WHERE user_id = ?", [JSON.stringify(session), user]);
            return;
        }

        if(session.step === 5){
            let receiptFile = "لا يوجد";
            if(msg.hasMedia){
                const media = await msg.downloadMedia();
                const fileName = `receipt_${Date.now()}.jpg`;
                const filePath = path.join(receiptsFolder, fileName);
                await fs.writeFile(filePath, Buffer.from(media.data, 'base64'));
                receiptFile = fileName;
            }

            const dateRecorded = new Date().toLocaleDateString('ar-PS');
            await dbRun(`INSERT INTO payments (name, amount, sender, senderNumber, senderName, datePayment, dateRecorded, receipt)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [session.name, session.amount, session.sender, user, msg._data.notifyName || "غير معروف", session.datePayment, dateRecorded, receiptFile]);

            if(ioInstance) ioInstance.emit('new_payment');
            msg.reply("تم التسجيل بنجاح، سيتم الرد خلال يوم عمل شكراً لتفهمكم ✅");
            await dbRun("DELETE FROM sessions WHERE user_id = ?", [user]);
        }
    } catch (err) {
        console.error("Internal Message Error:", err);
    }
});

// --- صمامات الأمان لمنع الانهيار (CRITICAL) ---

process.on('uncaughtException', (err) => {
    if (err.message.includes('Execution context was destroyed')) {
        console.warn('⚠️ تم تجاهل خطأ التنقل في الصفحة (Page Navigation Error).');
    } else {
        console.error('CRITICAL ERROR:', err);
        // process.exit(1); // اترك الخيار لـ PM2 لإعادة التشغيل إذا لزم الأمر
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

client.initialize();

module.exports = { client, setIo };