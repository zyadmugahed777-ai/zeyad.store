document.addEventListener('DOMContentLoaded', () => {
  const csrfToken = window.ZFB_ADMIN_CSRF || '';
  if (csrfToken) {
    document.querySelectorAll('form[method="POST"], form[method="post"]').forEach(form => {
      if (!form.querySelector('input[name="_csrf"]')) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = '_csrf';
        input.value = csrfToken;
        form.appendChild(input);
      }
    });
  }
  
  /* --------------------------------------------------------------------------
     Sidebar Toggle (Mobile)
     -------------------------------------------------------------------------- */
  const toggleBtn = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('adminSidebar');
  
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('open');
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 768) {
        if (!sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
          sidebar.classList.remove('open');
        }
      }
    });
  }

  /* --------------------------------------------------------------------------
     Theme Toggle (Dark/Light Mode)
     -------------------------------------------------------------------------- */
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const html = document.documentElement;
      const currentTheme = html.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      
      html.setAttribute('data-theme', newTheme);
      localStorage.setItem('zfb-admin-theme', newTheme);
      
      // Update icon
      const icon = themeToggle.querySelector('.material-symbols-rounded');
      icon.textContent = newTheme === 'dark' ? 'dark_mode' : 'light_mode';
      
      // Trigger event for Chart.js to re-render if needed
      window.dispatchEvent(new Event('themeChanged'));
    });
    
    // Set initial icon state
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const icon = themeToggle.querySelector('.material-symbols-rounded');
    if (icon) icon.textContent = currentTheme === 'dark' ? 'dark_mode' : 'light_mode';
  }

  /* --------------------------------------------------------------------------
     Auto-dismiss Alerts
     -------------------------------------------------------------------------- */
  const alerts = document.querySelectorAll('.alert:not(.alert-persistent)');
  alerts.forEach(alert => {
    setTimeout(() => {
      alert.style.opacity = '0';
      alert.style.transition = 'opacity 0.5s ease';
      setTimeout(() => alert.remove(), 500);
    }, 5000);
  });

  /* --------------------------------------------------------------------------
     Confirm Delete Actions
     -------------------------------------------------------------------------- */
  const deleteForms = document.querySelectorAll('form.delete-form');
  deleteForms.forEach(form => {
    form.addEventListener('submit', (e) => {
      if (!confirm('هل أنت متأكد من عملية الحذف؟ لا يمكن التراجع عن هذا الإجراء.')) {
        e.preventDefault();
      }
    });
  });

  document.querySelectorAll('[data-check-all]').forEach(master => {
    master.addEventListener('change', () => {
      document.querySelectorAll(master.dataset.checkAll).forEach(item => {
        item.checked = master.checked;
      });
    });
  });

  document.querySelectorAll('[data-live-search]').forEach(input => {
    input.addEventListener('input', () => {
      const target = document.querySelector(input.dataset.liveSearch);
      if (!target) return;
      const term = input.value.trim().toLowerCase();
      target.querySelectorAll('[data-search-row]').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
      });
    });
  });

  document.querySelectorAll('[data-sortable-url]').forEach(list => {
    if (!window.Sortable) return;
    Sortable.create(list, {
      handle: '[data-drag-handle]',
      animation: 150,
      onEnd: async () => {
        const ids = Array.from(list.querySelectorAll('[data-id]')).map((item) => item.dataset.id);
        await fetch(list.dataset.sortableUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ ids })
        });
      }
    });
  });

});
