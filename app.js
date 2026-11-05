(function () {
  'use strict';

  const STORAGE_KEY = 'practice-todos';

  const form = document.getElementById('new-todo-form');
  const input = document.getElementById('new-todo-input');
  const list = document.getElementById('todo-list');
  const summary = document.getElementById('summary');
  const emptyMessage = document.getElementById('empty-message');
  const filterButtons = document.querySelectorAll('.filters button');
  const toggleAllButton = document.getElementById('toggle-all');
  const clearDoneButton = document.getElementById('clear-done');

  let todos = load();
  let filter = 'all';

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    } catch (e) {
      // 저장소를 쓸 수 없는 환경(시크릿 모드 등)에서는 메모리에만 유지
    }
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function addTodo(text) {
    todos.push({ id: newId(), text: text, done: false });
    commit();
  }

  function updateTodo(id, changes) {
    todos = todos.map(function (t) { return t.id === id ? Object.assign({}, t, changes) : t; });
    commit();
  }

  function removeTodo(id) {
    todos = todos.filter(function (t) { return t.id !== id; });
    commit();
  }

  function commit() {
    save();
    render();
  }

  function visibleTodos() {
    if (filter === 'active') return todos.filter(function (t) { return !t.done; });
    if (filter === 'done') return todos.filter(function (t) { return t.done; });
    return todos;
  }

  function renderItem(todo) {
    const li = document.createElement('li');
    li.className = 'todo-item' + (todo.done ? ' done' : '');
    li.dataset.id = todo.id;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = todo.done;
    checkbox.setAttribute('aria-label', '완료 표시: ' + todo.text);
    checkbox.addEventListener('change', function () {
      updateTodo(todo.id, { done: checkbox.checked });
    });

    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = todo.text;
    text.title = '더블클릭하여 수정';
    text.addEventListener('dblclick', function () { startEditing(li, todo); });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'delete';
    del.textContent = '✕';
    del.setAttribute('aria-label', '삭제: ' + todo.text);
    del.addEventListener('click', function () { removeTodo(todo.id); });

    li.append(checkbox, text, del);
    return li;
  }

  function startEditing(li, todo) {
    const textEl = li.querySelector('.text');
    const editor = document.createElement('input');
    editor.type = 'text';
    editor.className = 'edit-input';
    editor.value = todo.text;
    editor.maxLength = 200;

    let finished = false;
    function finish(saveChanges) {
      if (finished) return;
      finished = true;
      const value = editor.value.trim();
      if (!saveChanges) return render();
      if (value === '') return removeTodo(todo.id);
      updateTodo(todo.id, { text: value });
    }

    editor.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    editor.addEventListener('blur', function () { finish(true); });

    li.replaceChild(editor, textEl);
    editor.focus();
    editor.select();
  }

  function render() {
    const items = visibleTodos();
    list.replaceChildren.apply(list, items.map(renderItem));

    const remaining = todos.filter(function (t) { return !t.done; }).length;
    const doneCount = todos.length - remaining;
    summary.textContent = todos.length === 0
      ? '새 할 일을 추가해 보세요.'
      : '남은 일 ' + remaining + '개 · 완료 ' + doneCount + '개';

    emptyMessage.hidden = items.length > 0;
    emptyMessage.textContent = filter === 'done' ? '완료한 할 일이 없습니다.'
      : filter === 'active' ? '진행 중인 할 일이 없습니다.'
      : '할 일이 없습니다.';

    filterButtons.forEach(function (btn) {
      const active = btn.dataset.filter === filter;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });

    toggleAllButton.disabled = todos.length === 0;
    toggleAllButton.textContent = todos.length > 0 && remaining === 0 ? '모두 미완료' : '모두 완료';
    clearDoneButton.disabled = doneCount === 0;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    addTodo(value);
    input.value = '';
    input.focus();
  });

  filterButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      filter = btn.dataset.filter;
      render();
    });
  });

  toggleAllButton.addEventListener('click', function () {
    const allDone = todos.every(function (t) { return t.done; });
    todos = todos.map(function (t) { return Object.assign({}, t, { done: !allDone }); });
    commit();
  });

  clearDoneButton.addEventListener('click', function () {
    todos = todos.filter(function (t) { return !t.done; });
    commit();
  });

  render();
})();
