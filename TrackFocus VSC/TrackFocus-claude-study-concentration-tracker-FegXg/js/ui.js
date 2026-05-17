// Helpers compartidos de UI.
const UI = (() => {

  const root = () => document.getElementById('app');

  function flash(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = `alert ${type}`;
    el.textContent = msg;
    root().prepend(el);
    setTimeout(() => el.remove(), 2800);
  }

  return { flash };
})();
