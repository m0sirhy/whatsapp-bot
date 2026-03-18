const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs').promises; // استخدام النسخة غير التزامنية لمنع التجمد
const path = require('path');
const { dbQuery, dbRun } = require('./db'); // استدعاء الدوال الجديدة

let ioInstance; 
function setIo(io) {
    ioInstance = io;
}

const receiptsFolder = path.join(__dirname, "receipts");
// التأكد من وجود المجلد (تزامنياً عند البدء فقط فلا بأس)
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

const QRCode = require('qrcode');

client.on('qr', qr => {
    QRCode.toDataURL(qr, { width: 300 }, (err, url) => {
        if(err) console.error("Error generating QR:", err);
        else if(ioInstance) ioInstance.emit('qr', url);
    });
});

client.on('ready', () => {
    if(ioInstance) ioInstance.emit('ready');
    console.log("WhatsApp Bot Ready");
});

client.on('authenticated', () => {
    if(ioInstance) ioInstance.emit('authenticated');
});

function arabicToEnglishNumbers(str) {
    const arabicNums = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
    return str.toString().replace(/[٠-٩]/g, d => arabicNums.indexOf(d));
}

client.on('message', async msg => {
    const user = msg.from;
    let text = msg.body.trim();
    text = arabicToEnglishNumbers(text);

    // 1. جلب الجلسة من قاعدة البيانات لضمان عدم ضياعها
    const rows = await dbQuery("SELECT data FROM sessions WHERE user_id = ?", [user]);
    let session = rows.length > 0 ? JSON.parse(rows[0].data) : null;

    if(text.toLowerCase() === "menu"){
        await dbRun("DELETE FROM sessions WHERE user_id = ?", [user]);
        msg.reply(`القائمة تم إعادة عرضها. أرسل أي رسالة لبدء العملية.`);
        return;
    }

    if(!session){
        msg.reply(`مرحباً\n\n1 - تسجيل دفعة\n2 - تقديم شكوى`);
        // حفظ الجلسة الجديدة
        await dbRun("INSERT OR REPLACE INTO sessions (user_id, data) VALUES (?, ?)", [user, JSON.stringify({step:0})]);
        return;
    }

    // الخطوة 1: تسجيل دفعة
    if(text === "1" && session.step === 0){
        session.step = 1;
        await dbRun("UPDATE sessions SET data = ? WHERE user_id = ?", [JSON.stringify(session), user]);
        msg.reply("اسم صاحب الاشتراك المسجل لدينا:");
        return;
    }

    // الخطوات من 1 إلى 4 (معالجة الاسم والمبلغ والتاريخ)
    if(session.step >= 1 && session.step <= 4) {
        if(session.step === 1) { session.name = text; msg.reply("اسم صاحب الحساب الذي تم التحويل منه:"); }
        else if(session.step === 2) { session.sender = text; msg.reply("قيمة الدفعة:"); }
        else if(session.step === 3) { session.amount = text; msg.reply("تاريخ الدفعة (مثال: 16-3-2026):"); }
        else if(session.step === 4) { session.datePayment = text; msg.reply("أرسل صورة الإشعار إن وجدت أو اكتب (لا يوجد):"); }
        
        session.step += 1;
        await dbRun("UPDATE sessions SET data = ? WHERE user_id = ?", [JSON.stringify(session), user]);
        return;
    }

    // الخطوة 5: الإشعار وحفظ البيانات النهائية
    if(session.step === 5){
        let receiptFile = "لا يوجد";

        if(msg.hasMedia){
            const media = await msg.downloadMedia();
            const fileName = `receipt_${Date.now()}.jpg`;
            const filePath = path.join(receiptsFolder, fileName);
            // حفظ الملف بشكل Async لضمان سرعة البوت
            await fs.writeFile(filePath, Buffer.from(media.data, 'base64'));
            receiptFile = fileName; // نحفظ الاسم فقط لسهولة العرض في الويب
        }

        const dateRecorded = new Date().toLocaleDateString('ar-PS');

        try {
            await dbRun(`INSERT INTO payments (name, amount, sender, senderNumber, senderName, datePayment, dateRecorded, receipt)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [session.name, session.amount, session.sender, user, msg._data.notifyName || "غير معروف", session.datePayment, dateRecorded, receiptFile]);

            // إرسال تنبيه لحظي للوحة التحكم
            if(ioInstance) ioInstance.emit('new_payment');

            msg.reply("تم التسجيل بنجاح، سيتم الرد خلال يوم عمل شكراً لتفهمكم ✅");
        } catch (err) {
            console.error("Database Insert Error:", err);
            msg.reply("عذراً، حدث خطأ أثناء حفظ البيانات. حاول مرة أخرى.");
        }

        // مسح الجلسة بعد الانتهاء
        await dbRun("DELETE FROM sessions WHERE user_id = ?", [user]);
        return;
    }
});

client.initialize();
module.exports = { client, setIo };