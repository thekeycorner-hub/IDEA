(() => {
  const chooser = document.getElementById('loginChooser');
  const panels = {
    client: document.getElementById('clientLoginPanel'),
    employee: document.getElementById('employeeLoginPanel')
  };

  document.querySelectorAll('[data-show-login]').forEach((button) => {
    button.addEventListener('click', () => {
      const selected = button.dataset.showLogin;
      chooser.hidden = true;
      Object.entries(panels).forEach(([name, panel]) => { panel.hidden = name !== selected; });
    });
  });

  document.querySelectorAll('[data-back-login]').forEach((button) => {
    button.addEventListener('click', () => {
      Object.values(panels).forEach((panel) => { panel.hidden = true; });
      chooser.hidden = false;
    });
  });
})();
