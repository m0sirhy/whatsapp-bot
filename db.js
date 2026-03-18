const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// فتح قاعدة البيانات
const db = new sqlite3.Database('./payments.db', (err) => {
    if (err) return console.error("خطأ في الاتصال بقاعدة البيانات:", err.message);
    console.log('Connected to SQLite database.');
});

db.serialize(() => {
    // جدول الدفعات: تم الإبقاء على عمود deleted لضمان عمل ميزة الحذف والاستعادة
    db.run(`CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT, 
        amount TEXT, 
        sender TEXT, 
        senderNumber TEXT, 
        senderName TEXT, 
        datePayment TEXT, 
        dateRecorded TEXT, 
        receipt TEXT, 
        status TEXT DEFAULT 'pending',
        deleted INTEGER DEFAULT 0
    )`);

    // جدول الجلسات الجديد لحماية بيانات المستخدم من الضياع عند إعادة تشغيل البوت
    db.run(`CREATE TABLE IF NOT EXISTS sessions (
        user_id TEXT PRIMARY KEY,
        data TEXT
    )`);
});

/**
 * دوال مساعدة تعتمد على الـ Promises 
 * لضمان التزامن ومنع تجميد السيرفر (Non-blocking)
 */

const dbQuery = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const dbRun = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) reject(err);
            else resolve(this.lastID); // إرجاع ID الصف المدرج أو المتأثر
        });
    });
};

// تصدير الأدوات الجديدة والقديمة المتوافقة
module.exports = { 
    db, 
    dbQuery, 
    dbRun,
    // الدوال التالية أصبحت الآن متوافقة مع نظام الـ Promises الجديد لسهولة الاستخدام
    getAllPayments: () => dbQuery("SELECT * FROM payments WHERE deleted=0 AND status='pending' ORDER BY id DESC"),
    getApprovedPayments: () => dbQuery("SELECT * FROM payments WHERE deleted=0 AND status='approved' ORDER BY id DESC"),
    getDeletedPayments: () => dbQuery("SELECT * FROM payments WHERE deleted=1 ORDER BY id DESC"),
    getEnteredPayments: () => dbQuery("SELECT * FROM payments WHERE status='entered' AND deleted=0 ORDER BY id DESC")
};