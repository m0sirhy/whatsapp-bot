// start.js
const path = require('path');

// 1️⃣ تشغيل واجهة الويب
console.log("تشغيل واجهة عرض الدفعات...");
require('./webserver'); // يبدأ سيرفر Express تلقائيًا على http://localhost:3000

// 2️⃣ تشغيل WhatsApp Bot
console.log("تشغيل WhatsApp Bot...");
require('./bot'); // يبدأ الـ WhatsApp bot ويستقبل الرسائل

console.log("النظام يعمل بالكامل ✅\n- افتح المتصفح على http://localhost:3000 لمتابعة الدفعات");