// bot-terminal-safe.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

function startBot() {
    const client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: { headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] }
    });

    client.on('qr', qr => {
        console.log("\nامسح QR لتسجيل الدخول:");
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log("\n✅ WhatsApp Bot جاهز!");
    });

    client.on('authenticated', () => {
        console.log("\n🔑 تم تسجيل الدخول بنجاح");
    });

    client.on('auth_failure', msg => {
        console.error("\n❌ فشل في المصادقة:", msg);
    });

    client.on('disconnected', reason => {
        console.warn("\n⚠️ تم قطع الاتصال، إعادة التشغيل:", reason);
        setTimeout(() => startBot(), 5000); // إعادة تشغيل بعد 5 ثواني
    });

    client.on('message', msg => {
        console.log(`[رسالة] من: ${msg.from} | النص: ${msg.body}`);
    });

    client.initialize().catch(err => {
        console.error("\n❌ خطأ أثناء التهيئة:", err);
        setTimeout(() => startBot(), 5000);
    });
}

// تشغيل البوت
startBot();