import { highlightCode } from './highlight.js';

export function createEditor(initialHTML, pageId = null) {
  const toolbar = document.createElement('div');
  toolbar.className = 'floating-toolbar';

  const root = document.createElement('div');
  root.className = 'editor-content-area';
  root.contentEditable = 'true';
  root.innerHTML = initialHTML || '<p><br></p>';

  const btn = (html, title, fn) => {
    const b = document.createElement('button');
    b.innerHTML = html;
    b.title = title;
    b.addEventListener('click', (e) => { e.preventDefault(); fn(); root.focus(); });
    toolbar.append(b);
    return b;
  };

  const cmd = (c, v = null) => document.execCommand(c, false, v);

  // --- ТЕКСТОВЫЕ КОМАНДЫ ---
  btn('<b>B</b>', 'Полужирный', () => cmd('bold'));
  btn('<i>I</i>', 'Курсив', () => cmd('italic'));
  btn('<u>U</u>', 'Подчёркнутый', () => cmd('underline'));
  
  const hr1 = document.createElement('span');
  hr1.style.cssText = 'width:1px; background:#e5e7eb; margin:0 4px;';
  toolbar.append(hr1);

  btn('H1', 'Заголовок 1', () => cmd('formatBlock', '<h1>'));
  btn('H2', 'Заголовок 2', () => cmd('formatBlock', '<h2>'));
  btn('H3', 'Заголовок 3', () => cmd('formatBlock', '<h3>'));
  
  const hr2 = document.createElement('span');
  hr2.style.cssText = 'width:1px; background:#e5e7eb; margin:0 4px;';
  toolbar.append(hr2);

  btn('≡', 'Маркированный список', () => cmd('insertUnorderedList'));
  btn('1.', 'Нумерованный список', () => cmd('insertOrderedList'));
  btn('❝', 'Цитата', () => cmd('formatBlock', '<blockquote>'));
  btn('🔗', 'Ссылка', () => { const url = prompt('URL:'); if (url) cmd('createLink', url); });
  btn('↩', 'Отменить', () => cmd('undo'));

  const insertCode = () => {
    const lang = prompt('Язык (python, js, sql, html, css):', 'js') || 'js';
    const code = prompt('Вставьте код:');
    if (!code) return;
    const pre = document.createElement('pre');
    pre.setAttribute('data-lang', lang);
    const codeEl = document.createElement('code');
    codeEl.innerHTML = highlightCode(code, lang);
    pre.append(codeEl);
    root.focus();
    const range = window.getSelection().getRangeAt(0);
    range.deleteContents();
    range.insertNode(pre);
    const p = document.createElement('p');
    pre.after(p);
    const r2 = document.createRange();
    r2.setStart(p, 0); r2.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r2);
  };

  const insertTable = () => {
    const rows = Number(prompt('Число строк:', '3')) || 3;
    const cols = Number(prompt('Число колонок:', '3')) || 3;
    let html = '<table border="1" style="border-collapse:collapse; width:100%; margin-bottom:16px;">';
    for (let i = 0; i < rows; i++) {
      html += '<tr>';
      for (let j = 0; j < cols; j++) html += '<td style="padding:8px;">&nbsp;</td>';
      html += '</tr>';
    }
    html += '</table><p><br></p>';
    document.execCommand('insertHTML', false, html);
  };

  const insertImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = document.createElement('img');
        img.src = reader.result;
        img.style.maxWidth = '100%';
        img.style.borderRadius = '8px';
        root.focus();
        const range = window.getSelection().getRangeAt(0);
        range.deleteContents();
        range.insertNode(img);
        const p = document.createElement('p'); img.after(p);
        const r = document.createRange(); r.setStart(p, 0); r.collapse(true);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      };
      reader.readAsDataURL(file);
    });
    input.click();
  };

  const insertVideo = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;

      const progressWrapper = document.createElement('div');
      progressWrapper.style.cssText = 'margin: 16px 0; padding: 16px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;';

      const progressText = document.createElement('div');
      progressText.style.cssText = 'font-size: 14px; color: #374151; margin-bottom: 8px; font-weight: 500;';
      progressText.textContent = 'Загрузка видео в БД: 0%';

      const progressBarBg = document.createElement('div');
      progressBarBg.style.cssText = 'width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;';

      const progressBarFill = document.createElement('div');
      progressBarFill.style.cssText = 'width: 0%; height: 100%; background: #3b82f6; transition: width 0.2s ease;';

      progressBarBg.appendChild(progressBarFill);
      progressWrapper.appendChild(progressText);
      progressWrapper.appendChild(progressBarBg);

      root.appendChild(progressWrapper);
      progressWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });

      const formData = new FormData();
      formData.append('video', file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/media/upload', true);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          progressText.textContent = `Загрузка видео в БД: ${percentComplete}%`;
          progressBarFill.style.width = percentComplete + '%';
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          progressText.textContent = 'Вставка в статью...';
          setTimeout(() => {
            progressWrapper.remove();
            const data = JSON.parse(xhr.responseText);
            
            const videoContainer = document.createElement('div');
            videoContainer.style.margin = '16px 0';

            const videoEl = document.createElement('video');
            videoEl.controls = true;
            videoEl.style.maxWidth = '100%';
            videoEl.style.borderRadius = '8px';
            videoEl.src = data.url;

            videoContainer.appendChild(videoEl);
            root.focus();
            const range = window.getSelection().getRangeAt(0);
            range.deleteContents();
            range.insertNode(videoContainer);
            
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            videoContainer.after(p);
            
          }, 300);
        } else {
          progressWrapper.remove();
          alert('Ошибка загрузки: ' + xhr.statusText);
        }
      };

      xhr.onerror = () => {
        progressWrapper.remove();
        alert('Ошибка сети при загрузке видео.');
      };

      xhr.send(formData);
    });
    input.click();
  };

  btn('🖼', 'Изображение', insertImage);
  btn('🎬', 'Видео', insertVideo);
  btn('</>', 'Блок кода', insertCode);

  return {
    toolbar,
    root,
    insertImage,
    insertTable,
    insertCode,
    insertVideo,
    getHTML() {
      root.querySelectorAll('pre[data-lang]').forEach(pre => {
        if (!pre.querySelector('code')) {
          const code = document.createElement('code');
          code.textContent = pre.textContent;
          pre.textContent = '';
          pre.append(code);
        }
      });
      return root.innerHTML;
    },
    setHTML(html) { root.innerHTML = html; },
  };
}
