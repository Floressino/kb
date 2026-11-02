export const state = {
  user: null,
  csrf: null,
  currentPage: null,
  section: 'kb',
  expandedNodes: new Set(),
  avatarUrl: null,
  cache: {
    tree: null,
    spaces: null
  }
};

export const $ = (sel, root = document) => root.querySelector(sel);
export const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'onclick') n.addEventListener('click', v);
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'html') n.innerHTML = v;
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    n.append(c.nodeType ? c : document.createTextNode(c));
  }
  return n;
};

export async function api(method, url, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (body && state.csrf) body.csrf = state.csrf;
  const res = await fetch(url, {
    method, headers, credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404) return { error: 'Not Found', status: 404 };
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Ошибка сервера');
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.blob();
}

export async function loadMe() {
  const data = await api('GET', '/api/me');
  state.user = data.user;
  state.csrf = data.user?.csrf;
  if (state.user) {
    renderProfile();
    api('GET', '/api/admin/avatar').then(res => {
      state.avatarUrl = res.avatar_url;
      renderProfile();
    }).catch(() => {});
  }
}

export function renderProfile() {
  const p = $('#profile');
  p.innerHTML = '';
  p.style.position = 'relative';
  if (state.user) {
    const avatarHtml = state.avatarUrl 
      ? `<img src="${state.avatarUrl}" style="width:32px; height:32px; border-radius:50%; object-fit:cover; border: 1px solid #475569;">`
      : `<div style="width:32px; height:32px; border-radius:50%; background:#3b82f6; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:14px;">${state.user.full_name.charAt(0).toUpperCase()}</div>`;
    const profileBtn = el('div', { style: 'display:flex; align-items:center; gap:8px; cursor:pointer; padding:4px 8px; border-radius:6px;' },
      el('div', { html: avatarHtml }),
      el('span', { style: 'font-size:14px; font-weight:500; color:#f8fafc;' }, state.user.full_name),
      el('span', { style: 'font-size:10px; color:#94a3b8;' }, '▼')
    );
    const dropdown = el('div', { style: 'position:absolute; top:45px; right:0; background:#fff; border:1px solid #e5e7eb; border-radius:8px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1); width:220px; padding:8px 0; display:none; z-index:100;' },
      el('div', { style: 'padding:8px 16px; border-bottom:1px solid #e5e7eb; margin-bottom:4px;' },
        el('div', { style: 'font-weight:600; font-size:14px; color:#111827;' }, state.user.full_name),
        el('div', { style: 'font-size:12px; color:#6b7280;' }, `@${state.user.login}`)
      ),
      el('div', { style: 'padding:8px 16px; font-size:14px; cursor:pointer;', onclick: () => { navigate('#/profile'); dropdown.style.display = 'none'; } }, '👤 Личный кабинет'),
      el('div', { style: 'padding:8px 16px; font-size:14px; cursor:pointer; color:#dc2626;', onclick: logout }, '🚪 Выйти')
    );
    profileBtn.addEventListener('click', (e) => { e.stopPropagation(); dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none'; });
    document.addEventListener('click', (e) => { if (!p.contains(e.target)) dropdown.style.display = 'none'; });
    p.append(profileBtn, dropdown);
  }
}

export async function logout() {
  await api('POST', '/api/logout', {});
  state.user = null; state.csrf = null; state.avatarUrl = null;
  state.cache = { tree: null, spaces: null };
  renderProfile();
  navigate('#/');
}

export async function navigate(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

// --- ВСТРОЕННАЯ ОТРИСОВКА ДЕРЕВА ---
function renderTree() {
  const container = $('#tree');
  if (!container) return;
  container.innerHTML = '';

  const rows = state.cache.tree || [];
  const spaces = state.cache.spaces || [];

  const pagesBySpace = {};
  for (const r of rows) {
    const sid = r.space_id ? String(r.space_id) : 'none';
    (pagesBySpace[sid] ||= []).push(r);
  }

  const iconFolder = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px; flex-shrink: 0;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
  const iconFile = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px; flex-shrink: 0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
  
  // НОВАЯ ВЕКТОРНАЯ ИКОНКА СТРЕЛКИ
  const iconArrow = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

  for (const space of spaces) {
    const spacePages = pagesBySpace[String(space.id)] || [];
    if (spacePages.length === 0) continue;

    const spaceWrap = el('div', { style: 'margin-bottom: 12px;' });
    
    const spaceTitle = el('div', { 
      style: 'display:flex; align-items:center; padding:6px 8px; font-size:13px; font-weight:600; color:#4b5563; cursor:pointer; border-radius:6px;'
    }, 
      el('span', { html: iconFolder, style: 'display:flex;' }),
      space.name
    );
    spaceWrap.append(spaceTitle);

    const byParent = {};
    for (const r of spacePages) {
      const pid = r.parent_id ? String(r.parent_id) : 'root';
      (byParent[pid] ||= []).push(r);
    }
    
    const renderNodes = (parentId, rootEl, depth) => {
      const children = byParent[parentId] || [];
      
      for (const node of children) {
        const nodeIdStr = String(node.id);
        const hasChildren = byParent[nodeIdStr] && byParent[nodeIdStr].length > 0;
        const isExpanded = state.expandedNodes.has(nodeIdStr);
        const isSelected = String(state.currentPage) === nodeIdStr;

        const row = el('div', {
          style: `display:flex; align-items:center; padding:6px 8px; padding-left:${depth * 16 + 8}px; border-radius:6px; font-size:13px; color:#4b5563; margin-bottom:2px;`
        });

        row.addEventListener('mouseenter', () => { if(!isSelected) row.style.background = '#f3f4f6'; });
        row.addEventListener('mouseleave', () => { if(!isSelected) row.style.background = 'transparent'; });
        if (isSelected) { row.style.background = '#eff6ff'; row.style.color = '#2563eb'; row.style.fontWeight = '500'; }

        // СТРЕЛОЧКА (нативная кнопка)
        if (hasChildren) {
          const arrowBtn = el('button', { 
            style: `background:none; border:none; padding:0; margin-right:4px; cursor:pointer; display:flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:4px; transition: transform 0.2s; transform: rotate(${isExpanded ? '90deg' : '0deg'});`,
            onmouseenter: (e) => e.currentTarget.style.background = '#e5e7eb',
            onmouseleave: (e) => e.currentTarget.style.background = 'transparent'
          });
          arrowBtn.innerHTML = iconArrow;
          arrowBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // ОСТАНОВКА КЛИКА, ЧТОБЫ НЕ ОТКРЫВАЛАСЬ СТАТЬЯ
            if (isExpanded) state.expandedNodes.delete(nodeIdStr);
            else state.expandedNodes.add(nodeIdStr);
            renderTree();
          });
          row.append(arrowBtn);
        } else {
          row.append(el('span', { style: 'width:24px;' }));
        }

        const iconHtml = hasChildren ? iconFolder : iconFile;
        row.append(el('span', { html: iconHtml, style: 'display:flex;' }));
        
        // САМА СТАТЬЯ (клик открывает)
        const titleSpan = el('span', { 
          style: 'flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:pointer;' 
        }, node.title);
        titleSpan.addEventListener('click', () => navigate(`#/page/${node.id}`));
        row.append(titleSpan);

        rootEl.append(row);

        if (hasChildren && isExpanded) {
          const childWrap = el('div');
          renderNodes(nodeIdStr, childWrap, depth + 1);
          rootEl.append(childWrap);
        }
      }
    };
    
    renderNodes('root', spaceWrap, 0);
    container.append(spaceWrap);
  }
}

let isRendering = false;
export async function render() {
  if (isRendering) return;
  isRendering = true;

  try {
    const main = $('#main');
    main.innerHTML = '';
    main.style.padding = '32px 40px';
    
    if (!state.user) {
      document.querySelector('.sidebar').style.display = 'none';
      document.querySelector('.topbar-center').style.display = 'none';
      $('#profile').style.display = 'none';
      document.querySelector('.layout').style.height = 'calc(100vh - 60px)';
      document.querySelector('.layout').style.background = '#f9fafb';
      const { renderAuth } = await import('./views/auth.js');
      main.append(await renderAuth());
      return;
    }

    document.querySelector('.sidebar').style.display = 'flex';
    document.querySelector('.topbar-center').style.display = 'flex';
    $('#profile').style.display = 'flex';
    document.querySelector('.layout').style.height = 'calc(100vh - 60px)';
    document.querySelector('.layout').style.background = '#f9fafb';

    const hash = location.hash || '#/';

    if (!state.cache.tree) {
      state.cache.tree = await api('GET', '/api/tree');
    }
    if (!state.cache.spaces) {
      state.cache.spaces = await api('GET', '/api/admin/spaces');
    }
    
    renderTree();

    if (hash === '#/' || hash === '') {
      state.section = 'kb';
      const { renderWelcome } = await import('./views/welcome.js');
      main.append(await renderWelcome());
      return;
    }
    if (hash === '#/drafts') {
      state.section = 'drafts';
      const { renderDrafts } = await import('./views/drafts.js');
      main.append(await renderDrafts());
      return;
    }
    if (hash.startsWith('#/page/')) {
      const id = hash.split('/')[2];
      state.currentPage = id;
      const { renderPage } = await import('./views/page.js');
      main.append(await renderPage(id));
      return;
    }
    if (hash === '#/new') { 
      main.style.padding = '0'; 
      const { renderEditor } = await import('./views/editor.js');
      main.append(await renderEditor(null)); 
      return; 
    }
    if (hash.startsWith('#/edit/')) {
      main.style.padding = '0';
      const id = hash.split('/')[2];
      const existing = await api('GET', `/api/pages/${id}`);
      const { renderEditor } = await import('./views/editor.js');
      main.append(await renderEditor(existing));
      return;
    }
    if (hash === '#/profile') {
      const { renderProfilePage } = await import('./views/profile.js');
      main.append(await renderProfilePage());
      return;
    }
    if (hash === '#/admin') {
      const roles = state.user.roles || [];
      const isGod = roles.includes('god') || roles.includes('admin') || state.user.login === 'admin' || roles.includes('eol') || roles.includes('manager');
      if (!isGod) {
        main.append(el('div', { class: 'card' }, 'Доступ запрещен.'));
        return;
      }
      try {
        const { renderAdmin } = await import('./views/admin.js');
        main.append(await renderAdmin());
      } catch (e) {
        main.append(el('div', { class: 'card', style: 'color:red;' }, 'Ошибка: ' + e.message));
      }
      return;
    }
    if (hash === '#/moderation') {
      const mod = await import('./moderation_v2.js');
      main.append(await mod.render());
      return;
    }
    
    main.append(el('div', { class: 'card' }, 'Страница не найдена'));
  } finally {
    isRendering = false;
  }
}

$('#globalSearch').addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim();
  if (!q) return;
  const rows = await api('GET', `/api/search?q=${encodeURIComponent(q)}`);
  const main = $('#main');
  main.innerHTML = '';
  main.style.padding = '32px 40px';
  main.append(el('div', { class: 'card' },
    el('h2', {}, `Результаты поиска: «${q}»`),
    rows.length ? el('ul', { style: 'padding-left: 20px;' }, ...rows.map(r => el('li', { style: 'margin-bottom: 16px;' },
      el('a', { href: `#/page/${r.id}`, style: 'font-size: 18px; font-weight: 500;' }, r.title),
      el('div', { html: r.snippet, style: 'color:#6b7280;font-size:14px;margin-top:4px;' })
    ))) : el('p', {}, 'Ничего не найдено.')
  ));
  location.hash = '#/';
});

window.addEventListener('hashchange', render);
document.querySelector('.btn-add').addEventListener('click', (e) => { e.preventDefault(); navigate('#/new'); });

async function init() {
  await loadMe();
  render();
}
init();
