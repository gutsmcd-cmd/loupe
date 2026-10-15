// 大きい文字 / Large text: an opt-in switch that adds `big-text` on <html>. Saved per app in localStorage.
const KEY = 'big-text';
const read = (): boolean => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
document.documentElement.classList.toggle('big-text', read());

export function bigTextButton(): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'big-text-btn';
  b.setAttribute('aria-label', '大きい文字 / Large text');
  b.title = '大きい文字 / Large text';
  b.innerHTML = '<span class="bt-s" aria-hidden="true">あ</span><span class="bt-l" aria-hidden="true">あ</span>';
  const sync = () => b.setAttribute('aria-pressed', String(document.documentElement.classList.contains('big-text')));
  sync();
  b.addEventListener('click', () => {
    const on = !document.documentElement.classList.contains('big-text');
    document.documentElement.classList.toggle('big-text', on);
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ }
    sync();
  });
  return b;
}
