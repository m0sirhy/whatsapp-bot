const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { insertPayment } = require('./db');

let ioInstance; // سيتم ربطه من webserver.js
function setIo(io) {
    ioInstance = io;
}
const receiptsFolder = path.join(__dirname, "receipts");
if (!fs.existsSync(receiptsFolder)) fs.mkdirSync(receiptsFolder);

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true, // تشغيل بدون واجهة رسومية
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        
        protocolTimeout: 120000, // زيادة وقت انتظار البروتوكول
        timeout: 0
    }
});
let sessions = {};

const QRCode = require('qrcode'); // ضع هذا أعلى الملف مع باقي require

client.on('qr', qr => {
    // توليد صورة QR مباشرة من النص
    QRCode.toDataURL(qr, { width: 300 }, (err, url) => {
        if(err) console.error("Error generating QR:", err);
        else if(ioInstance) ioInstance.emit('qr', url); // إرسال الصورة مباشرة للصفحة
    });

    // اختياري: طباعة النص على Terminal
   // qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    if(ioInstance) ioInstance.emit('ready');
    console.log("WhatsApp Bot Ready");
});

client.on('authenticated', () => {
    if(ioInstance) ioInstance.emit('authenticated');
});
client.on('ready', () => console.log("WhatsApp Bot Ready"));
    function arabicToEnglishNumbers(str) {
    const arabicNums = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
    return str.replace(/[٠-٩]/g, d => arabicNums.indexOf(d));
}
client.on('message', async msg => {
    const user = msg.from;
    let text = msg.body.trim();
    text = arabicToEnglishNumbers(text);

    // إعادة عرض القائمة
    if(text.toLowerCase() === "menu"){
        delete sessions[user];
        msg.reply(`القائمة تم إعادة عرضها. أرسل أي رسالة لبدء العملية.`);
        return;
    }


    // عرض القائمة لأول مرة
    if(!sessions[user]){
        msg.reply(`مرحباً\n\n1 - تسجيل دفعة\n2 - تقديم شكوى`);
        sessions[user] = {step:0};
        return;
    }

    // 1 - تسجيل دفعة
    if(text==="1" && sessions[user].step===0){
        sessions[user].step = 1;
        msg.reply("اسم صاحب الاشتراك المسجل لدينا:");
        return;
    }

    // اسم المشترك
    if(sessions[user].step===1){
        sessions[user].name = text;
        sessions[user].step = 2;
        msg.reply("اسم صاحب الحساب الذي تم التحويل منه:");
        return;
    }

    // صاحب الحساب المرسل
    if(sessions[user].step===2){
        sessions[user].sender = text;
        sessions[user].step = 3;
        msg.reply("قيمة الدفعة:");
        return;
    }

    // قيمة الدفعة
    if(sessions[user].step===3){
        sessions[user].amount = text;
        sessions[user].step = 4;
        msg.reply("تاريخ الدفعة (مثال: 16-3-2026):");
        return;
    }

    // تاريخ الدفعة من المستخدم
    if(sessions[user].step===4){
        sessions[user].datePayment = text;
        sessions[user].step = 5;
        msg.reply("أرسل صورة الإشعار إن وجدت أو اكتب (لا يوجد):");
        return;
    }

    // الإشعار (اختياري) + تاريخ التسجيل التلقائي
    if(sessions[user].step===5){
        let receiptFile = "لا يوجد";

        if(msg.hasMedia){
            const media = await msg.downloadMedia();
            const fileName = `receipt_${Date.now()}.jpg`;
            const filePath = path.join(receiptsFolder, fileName);
            fs.writeFileSync(filePath, Buffer.from(media.data, 'base64'));
            receiptFile = filePath;
        }

        const dateRecorded = new Date().toLocaleDateString('ar-PS');

        insertPayment({
            name: sessions[user].name,
            amount: sessions[user].amount,
            sender: sessions[user].sender,
            senderNumber: user,
            senderName: msg._data.notifyName || "غير معروف",
            datePayment: sessions[user].datePayment,
            dateRecorded,
            receipt: receiptFile
        }, (err)=>{
            if(err) console.error(err);
        });

        msg.reply("تم التسجيل  بنجاح ,سيتم الرد خلال يوم عمل  شكرا لتفهمكم ✅");
        delete sessions[user];
        return;
    }
});

client.initialize();
module.exports = { client, setIo };

