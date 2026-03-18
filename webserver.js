const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const bcrypt = require('bcrypt');

// استيراد الدوال من db.js (تأكد أن الملف موجود في نفس المجلد)
const {
    db, // استيراد القاعدة للعمليات المباشرة
    dbRun, // للعمليات التي لا نملك لها دالة جاهزة
    getAllPayments,
    getApprovedPayments,
    getDeletedPayments,
    getEnteredPayments,
    approvePayment,
    softDeletePayment,
    restorePayment
} = require('./db');

// استيراد البوت
const { client, setIo } = require('./bot');

const app = express();
const port = 3000;
const server = http.createServer(app);
const io = new Server(server);

// ربط الـ bot مع io ليرسل تنبيهات عند وصول رسائل جديدة
setIo(io);
global.ioInstance = io; // جعل الـ io متاحاً عالمياً للبوت

// إعدادات الجلسة (Sessions)
app.use(session({
    secret: 'mySecretKey123!', // يفضل تغييرها لاحقاً
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 60 * 60 * 1000 } // ساعة واحدة
}));

// بيانات الدخول (مشفرة بـ Bcrypt)
const USERS = [
    { username: 'admin', passwordHash: bcrypt.hashSync('1234', 10) }
];

// Middleware لحماية الصفحات من الوصول غير المصرح به
function authMiddleware(req, res, next) {
    if (req.session && req.session.user) return next();
    res.redirect('/login');
}

// إعدادات المجلدات الثابتة والقوالب
app.use('/receipts', express.static(path.join(__dirname, 'receipts')));
app.use('/sounds', express.static(path.join(__dirname, 'sounds')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- مسارات تسجيل الدخول والخروج ---

app.get('/login', (req, res) => res.render('login', { page: 'index', error: null }));

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = USERS.find(u => u.username === username);

    if (user && bcrypt.compareSync(password, user.passwordHash)) {
        req.session.user = username;
        return res.redirect('/');
    }
    res.render('login', { error: "اسم المستخدم أو كلمة المرور خاطئة" });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// --- مسارات الصفحات (Views) ---

app.get('/', authMiddleware, (req, res) => res.render('index', { page: 'index' }));
app.get('/approved', authMiddleware, (req, res) => res.render('approved', { page: 'approved' }));
app.get('/deleted', authMiddleware, (req, res) => res.render('deleted', { page: 'deleted' }));
app.get('/entered', authMiddleware, (req, res) => res.render('entered', { page: 'entered' }));
app.get('/wats', authMiddleware, (req, res) => res.render('wats', { page: 'wats' }));

// --- مسارات الـ API (تم تعديلها لنظام Async/Await) ---

app.get('/api/payments', authMiddleware, async (req, res) => {
    try {
        const rows = await getAllPayments();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/payments/approved', authMiddleware, async (req, res) => {
    try {
        const rows = await getApprovedPayments();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/payments/deleted', authMiddleware, async (req, res) => {
    try {
        const rows = await getDeletedPayments();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/payments/entered', authMiddleware, async (req, res) => {
    try {
        const rows = await getEnteredPayments();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// عمليات التحديث (Approve, Delete, Restore, Mark-Entered)
app.post('/api/payments/approve/:id', authMiddleware, async (req, res) => {
    try {
        await approvePayment(req.params.id);
        io.emit('data_changed'); // تحديث اللوحة فوراً لكل المفتوح عندهم المتصفح
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/payments/delete/:id', authMiddleware, async (req, res) => {
    try {
        await softDeletePayment(req.params.id);
        io.emit('data_changed');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/payments/restore/:id', authMiddleware, async (req, res) => {
    try {
        await restorePayment(req.params.id);
        io.emit('data_changed');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/payments/mark-entered/:id', authMiddleware, async (req, res) => {
    try {
        await dbRun("UPDATE payments SET status='entered' WHERE id=?", [req.params.id]);
        io.emit('data_changed');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// إرسال رسائل واتساب يدوياً من لوحة التحكم
app.post('/api/send-whatsapp-message', authMiddleware, async (req, res) => {
    try {
        const { number, message } = req.body;
        const formattedNumber = number.includes('@') ? number : `${number}@c.us`;
        await client.sendMessage(formattedNumber, message);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// الاتصال بـ Socket.io
io.on('connection', (socket) => {
    console.log('Client connected to dashboard');
});

// تشغيل السيرفر
server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});