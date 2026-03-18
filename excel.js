const ExcelJS = require('exceljs');
const { getAllPayments } = require('./db');
const path = require('path');

async function exportSQLiteToExcel() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Data");

    sheet.columns = [
        { header: "اسم المشترك", key: "name", width: 20 },
        { header: "قيمة الدفعة", key: "amount", width: 15 },
        { header: "صاحب الحساب المرسل", key: "sender", width: 20 },
        { header: "تاريخ الدفعة", key: "datePayment", width: 15 },
        { header: "تاريخ تسجيل الدفعة", key: "dateRecorded", width: 15 },
        { header: "الإشعار", key: "receipt", width: 30 }
    ];

    getAllPayments(async (err, rows) => {
        if (err) return console.error(err.message);

        rows.forEach(row => {
           let receiptValue = row.receipt !== "لا يوجد"
    ? { text: path.basename(row.receipt), hyperlink: `file://${row.receipt.replace(/\\/g, '/')}` }
    : "لا يوجد";

            sheet.addRow({
                name: row.name,
                amount: row.amount,
                sender: row.sender,
                datePayment: row.datePayment,
                dateRecorded: row.dateRecorded,
                receipt: receiptValue
            });
        });

        await workbook.xlsx.writeFile("payments.xlsx");
        console.log("تم تحديث Excel تلقائيًا ✅");
    });
}

module.exports = { exportSQLiteToExcel };