document.querySelectorAll('.site-menu').forEach(menu => {
  const trigger = menu.querySelector('summary');
  const links = [...menu.querySelectorAll('a')];
  const close = (restoreFocus = false) => {
    menu.open = false;
    if (restoreFocus) trigger.focus();
  };
  document.addEventListener('click', event => {
    if (!menu.contains(event.target)) close();
  });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) {
      event.preventDefault();
      close(true);
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      menu.open = true;
      const current = links.indexOf(document.activeElement);
      const next = current < 0 ? (event.key === 'ArrowDown' ? 0 : links.length - 1) : (current + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
      links[next].focus();
    }
  });
  menu.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!menu.contains(document.activeElement)) close();
    }, 0);
  });
  links.forEach(link => link.addEventListener('click', () => close()));
});
