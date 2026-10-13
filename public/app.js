const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '₹' + Number(n).toFixed(2);

async function api(url, method = 'GET', body) {
  const r = await fetch('/api' + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Something went wrong.');
  return d;
}

let toastTimer;
function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = '', 2800);
}

const opts = (list, val, label, sel) => list.map(o => `<option value="${o[val]}" ${o[val] == sel ? 'selected' : ''}>${esc(typeof label === 'function' ? label(o) : o[label])}</option>`).join('');
const table = (heads, rows, empty) => rows.length
  ? `<div class="tablewrap"><table><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
  : `<div class="tablewrap"><p class="empty">${empty}</p></div>`;

function openForm(title, html, submit, okLabel = 'Save') {
  const d = $('#dlg');
  d.innerHTML = `<form id="f"><h3>${esc(title)}</h3>${html}<div class="row"><button type="button" class="ghost" data-act="close">Cancel</button><button class="primary">${okLabel}</button></div></form>`;
  d.showModal();
  $('#f').onsubmit = async e => {
    e.preventDefault();
    try { await submit(Object.fromEntries(new FormData(e.target)), e.target); d.close(); render(); }
    catch (x) { toast(x.message, true); }
  };
}

// ---------- Views ----------
const views = {
  async dashboard() {
    const [s, loans] = await Promise.all([api('/stats'), api('/borrowings')]);
    const due = loans.filter(l => !l.returned_on);
    $('#view').innerHTML = `<h2>Today at the desk</h2>
      <div class="stats">
        <div class="stat"><b>${s.active}</b><span>Books out</span></div>
        <div class="stat ${s.overdue ? 'alert' : ''}"><b>${s.overdue}</b><span>Overdue</span></div>
        <div class="stat"><b>${s.waiting}</b><span>Waiting reservations</span></div>
        <div class="stat"><b>${money(s.unpaid)}</b><span>Unpaid fines</span></div>
        <div class="stat"><b>${s.books}</b><span>Titles</span></div>
        <div class="stat"><b>${s.members}</b><span>Members</span></div>
      </div>
      <h3>Books out, soonest due first</h3>
      ${table(['Member', 'Book', 'Due', ''], due.map(l => `<tr><td>${esc(l.full_name)}</td><td>${esc(l.title)}</td><td>${l.due_date} ${l.overdue ? '<span class="tag bad">overdue</span>' : ''}</td><td class="actions"><button class="mini" data-act="return" data-id="${l.borrow_id}">Return</button></td></tr>`), 'Nothing is checked out.')}`;
  },

  async books() {
    const cats = await api('/categories');
    $('#view').innerHTML = `<h2>Books</h2>
      <div class="bar">
        <input id="search" type="search" placeholder="Search title or author" class="grow" aria-label="Search books">
        <select id="cat" aria-label="Category"><option value="0">All categories</option>${opts(cats, 'category_id', 'category_name')}</select>
        <button class="primary" data-act="add-book">Add book</button>
      </div><div id="list"></div>`;
    const load = async () => {
      const books = await api(`/books?search=${encodeURIComponent($('#search').value)}&category=${$('#cat').value}`);
      $('#list').innerHTML = table(['Title', 'Authors', 'Category', 'Year', 'Available', ''], books.map(b => `<tr>
        <td>${esc(b.title)}</td><td class="wrap">${esc(b.authors || 'Unknown')}</td><td>${esc(b.category_name)}</td><td>${b.published_year ?? ''}</td>
        <td><span class="tag ${b.copies_available ? 'ok' : 'bad'}">${b.copies_available} of ${b.copies_total}</span></td>
        <td class="actions">${b.copies_available
          ? `<button class="mini" data-act="borrow" data-id="${b.book_id}" data-title="${esc(b.title)}">Check out</button>`
          : `<button class="mini" data-act="reserve" data-id="${b.book_id}" data-title="${esc(b.title)}">Reserve</button>`}</td></tr>`), 'No books match your search.');
    };
    let t; $('#search').oninput = () => { clearTimeout(t); t = setTimeout(load, 250); };
    $('#cat').onchange = load;
    load();
  },

  async members() {
    const m = await api('/members');
    $('#view').innerHTML = `<h2>Members</h2><div class="bar"><span class="grow"></span><button class="primary" data-act="add-member">Add member</button></div>
      ${table(['Name', 'Email', 'Type', 'Joined', 'Books out'], m.map(x => `<tr><td>${esc(x.full_name)}</td><td>${esc(x.email)}</td><td><span class="tag">${x.member_type}</span></td><td>${x.joined_on}</td><td>${x.active_loans}</td></tr>`), 'No members yet.')}`;
  },

  async borrowings() {
    const all = await api('/borrowings');
    $('#view').innerHTML = `<h2>Loans</h2>
      <div class="bar"><select id="filter" aria-label="Filter loans"><option value="active">Out now</option><option value="overdue">Overdue</option><option value="all">All loans</option></select>
      <span class="grow"></span><button class="primary" data-act="borrow">New loan</button></div><div id="list"></div>`;
    const draw = () => {
      const f = $('#filter').value;
      const rows = all.filter(l => f === 'all' || (f === 'active' && !l.returned_on) || (f === 'overdue' && l.overdue));
      $('#list').innerHTML = table(['Member', 'Book', 'Borrowed', 'Due', 'Returned', ''], rows.map(l => `<tr>
        <td>${esc(l.full_name)}</td><td>${esc(l.title)}</td><td>${l.borrowed_on}</td><td>${l.due_date}</td>
        <td>${l.returned_on ?? (l.overdue ? '<span class="tag bad">overdue</span>' : '<span class="tag warn">out</span>')}</td>
        <td class="actions">${l.returned_on ? '' : `<button class="mini" data-act="return" data-id="${l.borrow_id}">Return</button>`}</td></tr>`), 'No loans in this view.');
    };
    $('#filter').onchange = draw; draw();
  },

  async reservations() {
    const r = await api('/reservations');
    const tag = s => `<span class="tag ${s === 'waiting' ? 'warn' : s === 'fulfilled' ? 'ok' : ''}">${s}</span>`;
    $('#view').innerHTML = `<h2>Reservations</h2><div class="bar"><span class="grow"></span><button class="primary" data-act="reserve">New reservation</button></div>
      ${table(['Member', 'Book', 'Reserved', 'Status', ''], r.map(x => `<tr><td>${esc(x.full_name)}</td><td>${esc(x.title)}</td><td>${x.reserved_on}</td><td>${tag(x.status)}</td>
        <td class="actions">${x.status === 'waiting' ? `<button class="mini" data-act="fulfill" data-id="${x.reservation_id}">Mark fulfilled</button> <button class="mini" data-act="cancel" data-id="${x.reservation_id}">Cancel</button>` : ''}</td></tr>`), 'No reservations.')}`;
  },

  async fines() {
    const f = await api('/fines');
    $('#view').innerHTML = `<h2>Fines</h2>
      ${table(['Member', 'Book', 'Due', 'Returned', 'Amount', 'Status', ''], f.map(x => `<tr><td>${esc(x.full_name)}</td><td>${esc(x.title)}</td><td>${x.due_date}</td><td>${x.returned_on ?? ''}</td><td>${money(x.amount)}</td>
        <td><span class="tag ${x.paid ? 'ok' : 'bad'}">${x.paid ? 'paid' : 'unpaid'}</span></td>
        <td class="actions">${x.paid ? '' : `<button class="mini" data-act="pay" data-id="${x.fine_id}">Mark paid</button>`}</td></tr>`), 'No fines. Late returns are charged ₹2 per day.')}`;
  },
};

let tab = 'dashboard';
async function render() {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  try { await views[tab](); } catch (e) { $('#view').innerHTML = `<p class="empty">Could not load data: ${esc(e.message)}. Check that the server and MySQL are running.</p>`; }
}

// ---------- Actions ----------
const memberSelect = async () => `<label>Member<select name="member_id" required>${opts(await api('/members'), 'member_id', m => `${m.full_name} (${m.member_type})`)}</select></label>`;

const actions = {
  close: () => $('#dlg').close(),

  async 'add-book'() {
    const [cats, authors] = await Promise.all([api('/categories'), api('/authors')]);
    openForm('Add book', `
      <label>Title<input name="title" required maxlength="150"></label>
      <label>Category<select name="category_id">${opts(cats, 'category_id', 'category_name')}</select></label>
      <label>Authors (hold Ctrl or Cmd to pick several)<select name="authors" multiple>${opts(authors, 'author_id', 'author_name')}</select></label>
      <label>Year published<input name="published_year" type="number" min="1901" max="2155"></label>
      <label>Copies<input name="copies" type="number" min="1" max="127" value="1" required></label>`,
      async (d, form) => {
        d.authors = [...form.authors.selectedOptions].map(o => o.value);
        await api('/books', 'POST', d); toast('Book added');
      });
  },

  'add-member'() {
    openForm('Add member', `
      <label>Full name<input name="full_name" required maxlength="100"></label>
      <label>Email<input name="email" type="email" required maxlength="150"></label>
      <label>Type<select name="member_type"><option value="student">Student</option><option value="staff">Staff</option></select></label>`,
      async d => { await api('/members', 'POST', d); toast('Member added'); });
  },

  async borrow(el) {
    const book = el.dataset.id
      ? `<p><b>${el.dataset.title}</b></p><input type="hidden" name="book_id" value="${el.dataset.id}">`
      : `<label>Book<select name="book_id">${opts((await api('/books')).filter(b => b.copies_available > 0), 'book_id', b => `${b.title} (${b.copies_available} left)`)}</select></label>`;
    openForm('Check out', book + await memberSelect(),
      async d => { await api('/borrowings', 'POST', d); toast('Checked out. Due in 14 days.'); }, 'Check out');
  },

  async reserve(el) {
    const book = el.dataset.id
      ? `<p><b>${el.dataset.title}</b></p><input type="hidden" name="book_id" value="${el.dataset.id}">`
      : `<label>Book<select name="book_id">${opts(await api('/books'), 'book_id', 'title')}</select></label>`;
    openForm('Reserve book', book + await memberSelect(),
      async d => { await api('/reservations', 'POST', d); toast('Reserved'); }, 'Reserve');
  },

  async return(el) {
    const { fine } = await api(`/borrowings/${el.dataset.id}/return`, 'POST');
    toast(fine ? `Returned late. Fine of ${money(fine)} added.` : 'Returned');
    render();
  },
  async cancel(el) { await api(`/reservations/${el.dataset.id}/cancel`, 'POST'); toast('Reservation cancelled'); render(); },
  async fulfill(el) { await api(`/reservations/${el.dataset.id}/fulfill`, 'POST'); toast('Reservation fulfilled'); render(); },
  async pay(el) { await api(`/fines/${el.dataset.id}/pay`, 'POST'); toast('Fine marked paid'); render(); },
};

document.addEventListener('click', async e => {
  const nav = e.target.closest('[data-tab]');
  if (nav) { tab = nav.dataset.tab; return render(); }
  const el = e.target.closest('[data-act]');
  if (!el || !actions[el.dataset.act]) return;
  try { await actions[el.dataset.act](el); } catch (x) { toast(x.message, true); }
});

render();
