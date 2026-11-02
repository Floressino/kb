import { state, el, api } from '../app.js';

export async function renderAdmin() {
  const inputStyle = 'width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:6px; font-size:14px; margin-bottom:16px; outline:none; box-sizing:border-box;';
  const labelStyle = 'display:block; font-size:13px; font-weight:500; color:#374151; margin-bottom:6px;';

  const openCreateModal = async () => {
    let departments = [];
    try { departments = await api('GET', '/api/admin/spaces'); } catch (e) {}

    const modal = el('div', { class: 'modal-backdrop' });
    const loginInput = el('input', { placeholder: 'Например: ivanov', style: inputStyle });
    const fioInput = el('input', { placeholder: 'Иванов Иван Иванович', style: inputStyle });
    const pwdInput = el('input', { type: 'password', placeholder: 'Минимум 6 символов', style: inputStyle });
    
    const deptSelect = el('select', { style: inputStyle },
      el('option', { value: '' }, '— Без отдела —'),
      ...departments.map(d => el('option', { value: d.id }, d.name))
    );
    
    const roleSelect = el('select', { style: inputStyle },
      el('option', { value: 'employee' }, 'Сотрудники'),
      el('option', { value: 'manager' }, 'Руководители'),
      el('option', { value: 'eol' }, 'ЕОЛ'),
      el('option', { value: 'god' }, 'Боги')
    );

    const box = el('div', { class: 'modal', style: 'max-width: 450px; padding: 28px;' },
      el('button', { class: 'close', onclick: () => modal.remove() }, '×'),
      el('h2', { style: 'margin-bottom: 24px; font-size: 20px;' }, 'Создать пользователя'),
      el('label', { style: labelStyle }, 'Логин'), loginInput,
      el('label', { style: labelStyle }, 'ФИО'), fioInput,
      el('label', { style: labelStyle }, 'Пароль'), pwdInput,
      el('label', { style: labelStyle }, 'Отдел'), deptSelect,
      el('label', { style: labelStyle }, 'Роль'), roleSelect,
      el('div', { style: 'display:flex; justify-content:flex-end; gap:10px; margin-top:8px;' },
        el('button', { class: 'btn secondary', onclick: () => modal.remove() }, 'Отмена'),
        el('button', {
          class: 'btn',
          onclick: async () => {
            if (!loginInput.value || !pwdInput.value) return alert('Заполните логин и пароль');
            try {
              await api('POST', '/api/admin/users', {
                login: loginInput.value, full_name: fioInput.value, password: pwdInput.value,
                department_id: deptSelect.value || null, roles: [roleSelect.value]
              });
              modal.remove(); location.reload(); 
            } catch (e) { alert(e.message); }
          }
        }, 'Создать')
      )
    );
    modal.append(box);
    document.getElementById('modalRoot').append(modal);
  };

  const openRolesModal = (user) => {
    const modal = el('div', { class: 'modal-backdrop' });
    
    const allRoles = [
      { code: 'employee', label: 'Сотрудники' },
      { code: 'manager', label: 'Руководители' },
      { code: 'eol', label: 'ЕОЛ' },
      { code: 'god', label: 'Боги' }
    ];

    const currentRole = (user.roles && user.roles.length > 0) ? String(user.roles[0]).toLowerCase().trim() : '';

    const radioButtons = allRoles.map(role => {
      const isChecked = (currentRole === role.code);
      
      const attrs = { 
        type: 'radio', 
        name: 'user_role',
        value: role.code, 
        style: 'width:16px; height:16px; margin-right:10px; cursor:pointer;' 
      };
      if (isChecked) attrs.checked = 'checked';
      
      const radio = el('input', attrs);
      
      return { 
        code: role.code, 
        radio, 
        element: el('label', { style: 'display:flex; align-items:center; margin-bottom:12px; font-size:14px; cursor:pointer; color:#374151;' }, radio, role.label) 
      };
    });

    const box = el('div', { class: 'modal', style: 'max-width: 400px; padding: 28px;' },
      el('button', { class: 'close', onclick: () => modal.remove() }, '×'),
      el('h2', { style: 'margin-bottom: 8px; font-size: 20px;' }, 'Роль пользователя'),
      el('p', { style: 'color:#6b7280; font-size:14px; margin-bottom: 24px;' }, `${user.full_name} (${user.login})`),
      el('div', {}, ...radioButtons.map(r => r.element)),
      el('div', { style: 'display:flex; justify-content:flex-end; gap:10px; margin-top:24px;' },
        el('button', { class: 'btn secondary', onclick: () => modal.remove() }, 'Отмена'),
        el('button', {
          class: 'btn',
          onclick: async () => {
            const selected = radioButtons.find(r => r.radio.checked);
            if (!selected) return;
            try {
              await api('PUT', `/api/admin/users/${user.id}/roles`, { roles: [selected.code] });
              modal.remove(); location.reload();
            } catch (e) { alert(e.message); }
          }
        }, 'Сохранить')
      )
    );
    modal.append(box);
    document.getElementById('modalRoot').append(modal);
  };

  const users = await api('GET', '/api/admin/users');

  const rows = users.map(u => {
    const rolesStr = (u.roles || []).map(r => {
      const role = String(r).toLowerCase().trim();
      if (role === 'god') return 'Боги';
      if (role === 'eol') return 'ЕОЛ';
      if (role === 'manager') return 'Руководители';
      if (role === 'employee') return 'Сотрудники';
      return r;
    }).join(', ');

    return el('tr', { style: 'border-bottom: 1px solid #f3f4f6;' },
      el('td', { style: 'padding: 12px 16px; font-size:14px;' }, u.login),
      el('td', { style: 'padding: 12px 16px; font-size:14px;' }, u.full_name),
      el('td', { style: 'padding: 12px 16px; font-size:14px;' }, u.department_name || '—'),
      el('td', { style: 'padding: 12px 16px;' }, 
        el('span', { style: 'background:#eff6ff; color:#2563eb; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:500;' }, rolesStr || 'Без роли')
      ),
      el('td', { style: 'padding: 12px 16px; text-align:right; white-space:nowrap;' }, 
        el('button', { class: 'btn secondary', style: 'padding: 6px 12px; font-size: 13px; margin-right: 8px;', onclick: () => openRolesModal(u) }, 'Изменить роль'),
        el('button', {
          class: 'btn secondary', style: 'padding: 6px 10px; font-size: 13px; color: #dc2626; border-color: #fca5a5; background: #fef2f2;',
          onclick: async () => {
            if (!confirm(`Вы уверены, что хотите удалить пользователя ${u.login}?`)) return;
            try { await api('DELETE', `/api/admin/users/${u.id}`, {}); location.reload(); } catch (e) { alert('Ошибка: ' + e.message); }
          }
        }, '🗑')
      )
    );
  });

  const table = el('table', { style: 'width:100%; border-collapse:collapse; text-align:left;' },
    el('thead', { style: 'background: #f9fafb; border-bottom: 1px solid #e5e7eb;' }, 
      el('tr', {}, 
        el('th', { style: 'padding: 12px 16px; font-size:13px; font-weight:600; color:#4b5563;' }, 'Логин'), 
        el('th', { style: 'padding: 12px 16px; font-size:13px; font-weight:600; color:#4b5563;' }, 'ФИО'), 
        el('th', { style: 'padding: 12px 16px; font-size:13px; font-weight:600; color:#4b5563;' }, 'Отдел'), 
        el('th', { style: 'padding: 12px 16px; font-size:13px; font-weight:600; color:#4b5563;' }, 'Роль'), 
        el('th', { style: 'padding: 12px 16px; font-size:13px; font-weight:600; color:#4b5563; text-align:right; width:200px;' }, 'Действия')
      )
    ),
    el('tbody', {}, ...rows)
  );

  const navBar = el('div', { style: 'display:flex; gap:10px; margin-bottom:24px; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px;' },
    el('button', { class: 'btn', style: 'background:transparent; color:var(--primary); border-bottom: 2px solid var(--primary); border-radius: 0; padding: 8px 16px;' }, 'Пользователи'),
    el('button', { class: 'btn secondary', style: 'border: none; box-shadow: none;', onclick: () => alert('Раздел в разработке') }, 'Отделы')
  );

  const usersTab = el('div', {},
    el('div', { style: 'display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;' },
      el('h2', { style: 'margin:0; font-size: 20px;' }, 'Список пользователей'),
      el('button', { class: 'btn', onclick: openCreateModal }, '➕ Создать пользователя')
    ),
    el('div', { class: 'card', style: 'padding:0; overflow:hidden; border-radius:8px; border: 1px solid #e5e7eb;' }, table)
  );

  return el('div', { style: 'max-width: 1200px; margin: 0 auto;' },
    // ДОБАВЛЕНА КНОПКА НАЗАД
    el('div', { style: 'margin-bottom: 16px;' },
      el('button', { 
        class: 'btn secondary', 
        style: 'padding: 6px 12px; font-size: 14px;', 
        onclick: () => history.back() 
      }, '← Назад')
    ),
    el('h1', { style: 'margin-bottom:24px; font-size: 28px;' }, '⚙️ Панель управления'),
    navBar, usersTab
  );
}
