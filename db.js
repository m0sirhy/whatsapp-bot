const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('payments.db', err=>{
    if(err) return console.error(err.message);
    console.log('Connected to SQLite database.');
});

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

function insertPayment({name, amount, sender, senderNumber, senderName, datePayment, dateRecorded, receipt}, cb){
    db.run(`INSERT INTO payments (name, amount, sender, senderNumber, senderName, datePayment, dateRecorded, receipt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, amount, sender, senderNumber, senderName, datePayment, dateRecorded, receipt], cb);
}

function getAllPayments(cb){ db.all("SELECT * FROM payments WHERE deleted=0 AND status='pending' ORDER BY id DESC", [], cb);}
function getApprovedPayments(cb){ db.all("SELECT * FROM payments WHERE deleted=0 AND status='approved' ORDER BY id DESC", [], cb);}
function getDeletedPayments(cb){ db.all("SELECT * FROM payments WHERE deleted=1 ORDER BY id DESC", [], cb);}
function approvePayment(id, cb){ db.run("UPDATE payments SET status='approved' WHERE id=?", [id], cb);}
function softDeletePayment(id, cb){ db.run("UPDATE payments SET deleted=1 WHERE id=?", [id], cb);}
function restorePayment(id, cb){ db.run("UPDATE payments SET deleted=0 WHERE id=?", [id], cb);}

module.exports = { db, insertPayment, getAllPayments, getApprovedPayments, getDeletedPayments, approvePayment, softDeletePayment, restorePayment };