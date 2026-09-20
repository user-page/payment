/**
 * Chuyển tab. Trạng thái tab đang mở được nhớ lại cho lần sau.
 */
import { byId } from '../utils/dom.js';

const STORAGE_KEY = 'ctn-active-tab';
const PANELS = ['create', 'edit', 'list', 'debt'];

let current = 'create';

export function initTabs() {
  for (const btn of document.querySelectorAll('.tab-btn')) {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  }

  let remembered = null;
  try {
    remembered = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* chế độ ẩn danh chặn lưu — bỏ qua, dùng tab mặc định */
  }
  switchTab(PANELS.includes(remembered) ? remembered : 'create');
}

export function switchTab(name) {
  if (!PANELS.includes(name)) return;
  current = name;

  for (const key of PANELS) {
    const panel = byId(`tab${key[0].toUpperCase()}${key.slice(1)}`);
    if (panel) panel.hidden = key !== name;
  }
  for (const btn of document.querySelectorAll('.tab-btn')) {
    btn.classList.toggle('is-active', btn.dataset.tab === name);
  }

  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    /* bỏ qua */
  }
}

export const activeTab = () => current;
