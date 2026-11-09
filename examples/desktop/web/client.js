for (const mode of ['player', 'board']) {
  document.getElementById(mode).addEventListener('click', () => {
    document.documentElement.dataset.mode = mode;
    window.dispatchEvent(new CustomEvent('fixture-mode', { detail: { mode } }));
  });
window.dispatchEvent(new CustomEvent('fixture-mode', { detail: { mode: 'player' } }));
