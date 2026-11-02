async function api(method, url, body) {
  const me = await fetch('/api/me').then(r => r.json());
  const res = await fetch(url, {
    method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify({ ...body, csrf: me.user?.csrf }) : undefined,
  });
  if (!res.ok) throw new Error((await res.json()).error || res.statusText);
  return res.json();
}

export async function render() {
  const me = await fetch('/api/me').then(r => r.json());
  const queue = await fetch('/api/moderation/queue').then(r => r.json());

  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.style.padding = '32px';
  wrap.append(Object.assign(document.createElement('h1'), { textContent: 'CRM: очередь модерации' }));

  if (queue.length === 0) {
    wrap.append(Object.assign(document.createElement('p'), { textContent: 'Очередь пуста. Все статьи проверены!', style: 'color: #6b7280; margin-top: 16px;' }));
    return wrap;
  }

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  
  table.innerHTML = `
    <thead><tr style="background:#f9fafb; border-bottom:1px solid #e5e7eb;">
      <th style="padding:12px 16px; text-align:left; color:#4b5563; font-size:13px; width: 30%;">Статья</th>
      <th style="padding:12px 16px; text-align:left; color:#4b5563; font-size:13px; width: 20%;">Автор</th>
      <th style="padding:12px 16px; text-align:left; color:#4b5563; font-size:13px; width: 15%;">Статус</th>
      <th style="padding:12px 16px; text-align:left; color:#4b5563; font-size:13px; width: 15%;">Модератор</th>
      <th style="padding:12px 16px; text-align:right; color:#4b5563; font-size:13px; width: 20%;">Действия</th>
    </tr></thead>
    <tbody></tbody>`;
  const tbody = table.querySelector('tbody');

  queue.forEach((row) => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #f3f4f6';
    
    let statusText = row.status;
    if (row.status === 'in_progress') statusText = 'В работе';
    if (row.status === 'pending') statusText = 'Ожидает';

    tr.innerHTML = `
      <td style="padding:12px 16px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><a href="#/page/${row.page_id}" style="font-weight: 500; color:#2563eb;">${escapeHtml(row.title)}</a></td>
      <td style="padding:12px 16px; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(row.author)}</td>
      <td style="padding:12px 16px;"><span style="font-size:12px; padding:2px 8px; border-radius:12px; white-space:nowrap; background:${row.status === 'in_progress' ? '#dbeafe; color:#1e40af' : '#fef3c7; color:#92400e'}">${statusText}</span></td>
      <td style="padding:12px 16px; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(row.moderator || '—')}</td>
      <td style="padding:12px 16px; text-align: right; white-space:nowrap;"></td>`;
    const td = tr.lastElementChild;

    if (row.status === 'pending') {
      const take = document.createElement('button');
      take.className = 'btn';
      take.textContent = 'Взять в работу';
      take.style.marginRight = '8px';
      take.addEventListener('click', async () => {
        try { await api('POST', `/api/moderation/take/${row.id}`, {}); refresh(); }
        catch (e) { alert(e.message); }
      });
      td.append(take);
    }

    if (row.status === 'in_progress' && me.user?.id === row.assigned_moderator_id) {
      const ok = document.createElement('button');
      ok.className = 'btn';
      ok.textContent = 'Одобрить';
      ok.style.marginRight = '8px';
      ok.addEventListener('click', async () => {
        try { await api('POST', `/api/moderation/decide/${row.id}`, { action: 'approve' }); refresh(); }
        catch (e) { alert(e.message); }
      });
      
      const no = document.createElement('button');
      no.className = 'btn danger';
      no.textContent = 'Отклонить';
      no.style.marginRight = '8px';
      no.addEventListener('click', async () => {
        const comment = prompt('Причина отклонения (обязательно):');
        if (!comment) return;
        try { await api('POST', `/api/moderation/decide/${row.id}`, { action: 'reject', comment }); refresh(); }
        catch (e) { alert(e.message); }
      });
      td.append(ok, no);
    }

    // КНОПКА УДАЛЕНИЯ (ДОСТУПНА ВСЕМ, КТО В ОЧЕРЕДИ)
    const del = document.createElement('button');
    del.className = 'btn secondary';
    del.style.cssText = 'padding: 6px 10px; color: #dc2626; border-color: #fca5a5; background: #fef2f2;';
    del.textContent = '🗑 Удалить';
    del.addEventListener('click', async () => {
      if (!confirm(`Вы уверены, что хотите навсегда удалить статью "${row.title}"?`)) return;
      try {
        await api('DELETE', `/api/pages/${row.page_id}`, {});
        refresh();
      } catch (e) { alert(e.message); }
    });
    td.append(del);

    tbody.append(tr);
  });

  function refresh() { location.hash = '#/moderation'; location.reload(); }

  wrap.append(table);
  return wrap;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
