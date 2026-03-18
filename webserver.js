const express = require('express');
const path = require('path');
const {
    getAllPayments,
    getApprovedPayments,
    getDeletedPayments,
    approvePayment,
    softDeletePayment,
    restorePayment
} = require('./db');

const app = express();
const port = 3000;
const { db } = require('./db');
const http = require('http');
const { Server } = require('socket.io');
const { client, setIo } = require('./bot'); // ربط البوت

// حول app إلى server
const server = http.createServer(app);

// أنشئ Socket.io
const io = new Server(server);
const session = require('express-session');
const bcrypt = require('bcrypt');

app.use(session({
    secret: 'mySecretKey123!', // غيّرها لمفتاح قوي
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 60*60*1000 } // ساعة واحدة
}));

// بيانات الدخول (يمكن تغييرها لاحقاً)
const USERS = [
    { username: 'admin', passwordHash: bcrypt.hashSync('1234', 10) } // كلمة المرور مشفرة
];

// Middleware لحماية الصفحات
function authMiddleware(req, res, next) {
    if(req.session && req.session.user) return next();
    res.redirect('/login');
}
// ربط الـ bot مع io
setIo(io);

// مثال لتسجيل اتصال أي عميل للـ QR
io.on('connection', (socket) => {
    console.log('New client connected for QR');
});

app.use('/receipts', express.static(path.join(__dirname,'receipts')));
app.use('/sounds', express.static(path.join(__dirname,'sounds')));
app.use(express.urlencoded({extended:true}));
app.use(express.json());

app.set('view engine','ejs');
app.set('views', path.join(__dirname,'views'));


app.post('/login', express.urlencoded({extended:true}), (req,res)=>{
    const { username, password } = req.body;
    const user = USERS.find(u => u.username === username);

    if(user && bcrypt.compareSync(password, user.passwordHash)){
        req.session.user = username;
        return res.redirect('/');
    }

    res.render('login', { error: "اسم المستخدم أو كلمة المرور خاطئة" });
});
app.get('/logout', (req,res)=>{
    req.session.destroy();
    res.redirect('/login');
});
app.get('/login', (req, res) => res.render('login',{ page: 'index' , error: null }));

app.get('/', authMiddleware, (req,res)=> res.render('index', { page: 'index' }));
app.get('/approved', authMiddleware, (req,res)=> res.render('approved', { page: 'approved' }));
app.get('/deleted', authMiddleware, (req,res)=> res.render('deleted', { page: 'deleted' }));
app.get('/entered', authMiddleware, (req,res)=> res.render('entered', { page: 'entered' }));
app.get('/wats', authMiddleware, (req,res)=> res.render('wats', { page: 'wats' }));

app.get('/api/payments', (req,res)=> getAllPayments((err,rows)=> err? res.status(500).json({error:err.message}): res.json(rows)));
app.get('/api/payments/approved', (req,res)=> getApprovedPayments((err,rows)=> err? res.status(500).json({error:err.message}): res.json(rows)));
app.get('/api/payments/deleted', (req,res)=> getDeletedPayments((err,rows)=> err? res.status(500).json({error:err.message}): res.json(rows)));

app.post('/api/payments/approve/:id', (req,res)=> approvePayment(req.params.id, err=> err? res.status(500).json({error:err.message}): res.json({success:true})));
app.post('/api/payments/delete/:id', (req,res)=> softDeletePayment(req.params.id, err=> err? res.status(500).json({error:err.message}): res.json({success:true})));
app.post('/api/payments/restore/:id', (req,res)=> restorePayment(req.params.id, err=> err? res.status(500).json({error:err.message}): res.json({success:true})));
app.post('/api/payments/mark-entered/:id', (req, res) => {
    const id = req.params.id;
    db.run("UPDATE payments SET status='entered' WHERE id=?", [id], function(err){
        if(err) return res.status(500).json({error: err.message});
        res.json({success: true});
    });
});
// جلب الدفعات التي تم إدخالها للنظام
app.get('/api/payments/entered', (req, res) => {
    db.all("SELECT * FROM payments WHERE status='entered'", (err, rows) => {
        if(err) return res.status(500).json({error: err.message});
        res.json(rows);
    });
});
app.post('/api/send-whatsapp-message', express.json(), (req, res) => {
    const { number, message } = req.body;

    // استخدم البوت هنا
    const formattedNumber = number.includes('@') ? number : `${number}@c.us`;

    client.sendMessage(formattedNumber, message)
        .then(() => res.json({success: true}))
        .catch(err => res.status(500).json({error: err.message}));
});
server.listen(port, ()=> console.log(`Server running at http://localhost:${port}`));