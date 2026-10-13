// Library Management backend: Express + MySQL
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');

const FINE_PER_DAY = 2;   // ₹ per overdue day
const LOAN_DAYS = 14;

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'library_db',
  dateStrings: true,
  connectionLimit: 10,
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const q = async (sql, p = []) => (await pool.query(sql, p))[0];
const route = fn => (req, res) =>
  fn(req, res).catch(e => {
    console.error(e.message);
    const msg = e.code === 'ER_DUP_ENTRY' ? 'That value already exists.'
      : e.code === 'ER_NO_REFERENCED_ROW_2' ? 'Selected member or book does not exist.' : e.message;
    res.status(e.status || 500).json({ error: msg });
  });

async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
}

// ---------- Lookups ----------
app.get('/api/categories', route(async (_, res) => res.json(await q('SELECT * FROM categories ORDER BY category_name'))));
app.get('/api/authors', route(async (_, res) => res.json(await q('SELECT * FROM authors ORDER BY author_name'))));

// ---------- Dashboard ----------
app.get('/api/stats', route(async (_, res) => {
  const [r] = await q(`SELECT
    (SELECT COUNT(*) FROM books) books,
    (SELECT COUNT(*) FROM members) members,
    (SELECT COUNT(*) FROM borrowings WHERE returned_on IS NULL) active,
    (SELECT COUNT(*) FROM borrowings WHERE returned_on IS NULL AND due_date < CURDATE()) overdue,
    (SELECT COUNT(*) FROM reservations WHERE status='waiting') waiting,
    (SELECT COALESCE(SUM(amount),0) FROM fines WHERE paid = 0) unpaid`);
  res.json(r);
}));

// ---------- Books ----------
app.get('/api/books', route(async (req, res) => {
  const s = `%${req.query.search || ''}%`;
  const cat = Number(req.query.category) || 0;
  res.json(await q(`
    SELECT b.*, c.category_name,
           (SELECT GROUP_CONCAT(a.author_name SEPARATOR ', ')
              FROM book_authors ba JOIN authors a ON a.author_id = ba.author_id
             WHERE ba.book_id = b.book_id) AS authors
      FROM books b JOIN categories c ON c.category_id = b.category_id
     WHERE (b.title LIKE ? OR b.book_id IN (
              SELECT ba.book_id FROM book_authors ba JOIN authors a ON a.author_id = ba.author_id
               WHERE a.author_name LIKE ?))
       AND (? = 0 OR b.category_id = ?)
     ORDER BY b.title`, [s, s, cat, cat]));
}));

app.post('/api/books', route(async (req, res) => {
  const { title, category_id, published_year, copies, authors = [] } = req.body;
  const n = Number(copies);
  if (!title?.trim()) throw bad('Title is required.');
  if (!category_id) throw bad('Choose a category.');
  if (!(n >= 1 && n <= 127)) throw bad('Copies must be between 1 and 127.');
  const id = await tx(async c => {
    const [r] = await c.query(
      'INSERT INTO books (title, category_id, published_year, copies_total, copies_available) VALUES (?,?,?,?,?)',
      [title.trim(), category_id, published_year || null, n, n]);
    for (const a of authors) await c.query('INSERT INTO book_authors VALUES (?,?)', [r.insertId, a]);
    return r.insertId;
  });
  res.status(201).json({ book_id: id });
}));

// ---------- Members ----------
app.get('/api/members', route(async (_, res) => res.json(await q(`
  SELECT m.*, (SELECT COUNT(*) FROM borrowings b WHERE b.member_id = m.member_id AND b.returned_on IS NULL) AS active_loans
    FROM members m ORDER BY m.full_name`))));

app.post('/api/members', route(async (req, res) => {
  const { full_name, email, member_type } = req.body;
  if (!full_name?.trim() || !email?.trim()) throw bad('Name and email are required.');
  const [r] = await pool.query(
    'INSERT INTO members (full_name, email, member_type, joined_on) VALUES (?,?,?,CURDATE())',
    [full_name.trim(), email.trim(), member_type === 'staff' ? 'staff' : 'student']);
  res.status(201).json({ member_id: r.insertId });
}));

// ---------- Borrowings ----------
app.get('/api/borrowings', route(async (_, res) => res.json(await q(`
  SELECT br.*, m.full_name, b.title,
         (br.returned_on IS NULL AND br.due_date < CURDATE()) AS overdue
    FROM borrowings br
    JOIN members m ON m.member_id = br.member_id
    JOIN books b ON b.book_id = br.book_id
   ORDER BY (br.returned_on IS NULL) DESC, br.due_date`))));

app.post('/api/borrowings', route(async (req, res) => {
  const { member_id, book_id } = req.body;
  await tx(async c => {
    const [[book]] = await c.query('SELECT copies_available FROM books WHERE book_id = ? FOR UPDATE', [book_id]);
    if (!book) throw bad('Book not found.', 404);
    if (book.copies_available < 1) throw bad('No copies available. Reserve this book instead.');
    await c.query('INSERT INTO borrowings (member_id, book_id, borrowed_on, due_date) VALUES (?,?,CURDATE(),DATE_ADD(CURDATE(), INTERVAL ? DAY))',
      [member_id, book_id, LOAN_DAYS]);
    await c.query('UPDATE books SET copies_available = copies_available - 1 WHERE book_id = ?', [book_id]);
  });
  res.status(201).json({ ok: true });
}));

app.post('/api/borrowings/:id/return', route(async (req, res) => {
  const fine = await tx(async c => {
    const [[b]] = await c.query(
      'SELECT book_id, returned_on, GREATEST(DATEDIFF(CURDATE(), due_date), 0) AS late FROM borrowings WHERE borrow_id = ? FOR UPDATE',
      [req.params.id]);
    if (!b) throw bad('Borrowing not found.', 404);
    if (b.returned_on) throw bad('Already returned.');
    await c.query('UPDATE borrowings SET returned_on = CURDATE() WHERE borrow_id = ?', [req.params.id]);
    await c.query('UPDATE books SET copies_available = copies_available + 1 WHERE book_id = ?', [b.book_id]);
    if (b.late > 0) {
      const amount = b.late * FINE_PER_DAY;
      await c.query('INSERT INTO fines (borrow_id, amount) VALUES (?,?)', [req.params.id, amount]);
      return amount;
    }
    return 0;
  });
  res.json({ fine });
}));

// ---------- Reservations ----------
app.get('/api/reservations', route(async (_, res) => res.json(await q(`
  SELECT r.*, m.full_name, b.title
    FROM reservations r
    JOIN members m ON m.member_id = r.member_id
    JOIN books b ON b.book_id = r.book_id
   ORDER BY (r.status = 'waiting') DESC, r.reserved_on`))));

app.post('/api/reservations', route(async (req, res) => {
  const { member_id, book_id } = req.body;
  const [dup] = await q("SELECT 1 FROM reservations WHERE member_id=? AND book_id=? AND status='waiting'", [member_id, book_id]);
  if (dup) throw bad('This member already has a waiting reservation for that book.');
  await pool.query('INSERT INTO reservations (member_id, book_id, reserved_on) VALUES (?,?,CURDATE())', [member_id, book_id]);
  res.status(201).json({ ok: true });
}));

app.post('/api/reservations/:id/:action(cancel|fulfill)', route(async (req, res) => {
  const status = req.params.action === 'cancel' ? 'cancelled' : 'fulfilled';
  await pool.query("UPDATE reservations SET status = ? WHERE reservation_id = ? AND status = 'waiting'", [status, req.params.id]);
  res.json({ ok: true });
}));

// ---------- Fines ----------
app.get('/api/fines', route(async (_, res) => res.json(await q(`
  SELECT f.*, m.full_name, b.title, br.due_date, br.returned_on
    FROM fines f
    JOIN borrowings br ON br.borrow_id = f.borrow_id
    JOIN members m ON m.member_id = br.member_id
    JOIN books b ON b.book_id = br.book_id
   ORDER BY f.paid, f.fine_id DESC`))));

app.post('/api/fines/:id/pay', route(async (req, res) => {
  await pool.query('UPDATE fines SET paid = TRUE WHERE fine_id = ?', [req.params.id]);
  res.json({ ok: true });
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Library app running at http://localhost:${PORT}`));
