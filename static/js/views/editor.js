import { state, $, el, api, navigate } from '../app.js';

export async function renderEditor(existing) {
  const { createEditor } = await import('../editor.js');
  const { renderLabelsField } = await import('../labels.js');
  
  const spaces = await api('GET', '/api/admin/spaces');
  const tree = await api('GET', '/api/tree');

  const labelsField = renderLabelsField(existing?.labels || []);
  const editor = createEditor(existing?.content || '', existing?.id || null);

  const main = $('#main');
  main.style.padding = '0';
  main.style.background = '#fff';

  // --- НАСТРОЙКИ ---
  const spacePathInput = el('input', {
    value: existing ? spaces.find(s => s.id === existing.space_id)?.name : (spaces[0]?.name || 'Общее'),
    placeholder: 'Отдел',
    style: 'margin-bottom: 10px;',
    list: 'spaces-list'
  });
  const spacesDatalist = el('datalist', { id: 'spaces-list' }, ...spaces.map(s => el('option', { value: s.name })));

  const parentSelect = el('select', {
    style: 'margin-bottom: 10px;'
  },
    el('option', { value: '' }, '— Корень отдела —'),
    ...tree.filter(p => !existing || p.id !== existing.id).map(p => el('option', { value: p.id }, p.title))
  );
  if (existing && existing.parent_id) parentSelect.value = existing.parent_id;

  // --- ЛОГИКА СОХРАНЕНИЯ ---
  const save = async (isModeration = false) => {
    const spacePath = spacePathInput.value.trim();
    if (!spacePath) return alert('Укажите отдел (пространство)');
    
    const payload = {
      title: titleInput.value,
      content: editor.getHTML(),
      space_path: spacePath,
      parent_id: parentSelect.value ? parentSelect.value : null,
      labels: labelsField.getLabels(),
    };

    try {
      let pageId = existing?.id;
      
      // 1. Сохраняем статью
      if (existing) {
        await api('PUT', `/api/pages/${existing.id}`, payload);
      } else {
        const res = await api('POST', '/api/pages', payload);
        pageId = res.id;
      }

      // 2. Если нужно на модерацию — отправляем
      if (isModeration && pageId) {
        await api('POST', `/api/moderation/submit/${pageId}`, {});
        alert('Статья отправлена на модерацию!');
      }

      // Обновляем дерево и переходим на страницу
      const { loadTree } = await import('./tree.js');
      await loadTree();
      navigate(`#/page/${pageId}`);
      
    } catch (e) {
      alert('Ошибка сохранения: ' + e.message);
    }
  };

  // --- ЭЛЕМЕНТЫ ---
  const titleInput = el('input', {
    class: 'editor-title-input',
    value: existing?.title || '',
    placeholder: 'Название статьи...',
  });

  // Модальное окно настроек
  const openSettings = () => {
    const modal = el('div', { class: 'modal-backdrop' });
    const box = el('div', { class: 'modal', style: 'max-width: 500px;' },
      el('button', { class: 'close', onclick: () => modal.remove() }, '×'),
      el('h2', {}, 'Настройки статьи'),
      el('label', {}, 'Пространство (Отдел):'), spacePathInput, spacesDatalist,
      el('label', {}, 'Вложить в папку:'), parentSelect,
      el('label', {}, 'Метки:'), labelsField.node
    );
    modal.append(box);
    document.getElementById('modalRoot').append(modal);
  };

  // --- ВЕРХНЯЯ ПАНЕЛЬ ---
  const topbar = el('div', { class: 'editor-topbar' },
    el('div', { style: 'display:flex; align-items:center; gap:16px;' },
      el('button', { class: 'btn secondary', onclick: () => history.back(), style: 'padding: 6px 12px;' }, '←'),
      el('span', { style: 'color:#6b7280; font-size:14px;' }, existing ? 'Редактирование' : 'Новая статья')
    ),
    el('div', { style: 'display:flex; align-items:center; gap:16px;' },
      el('span', { style: 'color:#10b981; font-size:13px; display:flex; align-items:center; gap:4px;' }, 
        el('span', { style: 'width:8px; height:8px; background:#10b981; border-radius:50%; display:inline-block;' }), 
        'Автосохранение'
      ),
      el('button', { class: 'btn secondary', onclick: openSettings }, '⚙️ Настройки'),
      // КНОПКА НА МОДЕРАЦИЮ
      el('button', { class: 'btn', style: 'background:#10b981;', onclick: () => save(true) }, '📤 На модерацию'),
      el('button', { class: 'btn', onclick: () => save(false) }, 'Сохранить')
    )
  );

  // --- ОСНОВНАЯ ЧАСТЬ ---
  const editorMain = el('div', { class: 'editor-main' },
    editor.toolbar,
    titleInput,
    editor.root
  );

  // --- ПРАВАЯ ПАНЕЛЬ ---
  const countWords = () => {
    const text = editor.root.innerText || '';
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  };

  const wordCountDisplay = el('div', { style: 'font-size:32px; font-weight:700; color:var(--text-main);' }, countWords());
  const wordLabel = el('div', { style: 'color:var(--text-muted); font-size:13px;' }, 'слов');

  editor.root.addEventListener('input', () => {
    wordCountDisplay.textContent = countWords();
  });

  const sidebar = el('div', { class: 'editor-sidebar' },
    el('div', { class: 'card' },
      el('div', { class: 'sidebar-section-title' }, '📊 Статистика'),
      el('div', { style: 'display:flex; align-items:baseline; gap:8px;' }, wordCountDisplay, wordLabel)
    ),
    el('div', { class: 'card' },
      el('div', { class: 'sidebar-section-title' }, '⚡ Быстрые действия'),
      el('div', { class: 'quick-action-btn', onclick: () => editor.insertImage() }, '🖼 Добавить изображение'),
      el('div', { class: 'quick-action-btn', onclick: () => editor.insertVideo() }, '🎬 Добавить видео'), 
      el('div', { class: 'quick-action-btn', onclick: () => editor.insertTable() }, '📊 Вставить таблицу'),
      el('div', { class: 'quick-action-btn', onclick: () => editor.insertCode() }, '💻 Блок кода')
    )
  );

  // --- СБОРКА ---
  return el('div', { style: 'display:flex; flex-direction:column; height:100%;' },
    topbar,
    el('div', { class: 'editor-layout' },
      editorMain,
      sidebar
    )
  );
}
