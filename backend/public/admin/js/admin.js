document.addEventListener('DOMContentLoaded', () => {
  // Theme logic is now handled in head.ejs and topbar.ejs

  // Auto-hide flash messages
  const flashAlerts = document.querySelectorAll('.alert');
  flashAlerts.forEach(alert => {
    setTimeout(() => {
      alert.style.opacity = '0';
      setTimeout(() => alert.remove(), 300);
    }, 5000);
  });

  // Confirm delete actions
  const deleteForms = document.querySelectorAll('.delete-form');
  deleteForms.forEach(form => {
    form.addEventListener('submit', (e) => {
      if (!confirm('هل أنت متأكد من الحذف؟ لا يمكن التراجع عن هذه العملية.')) {
        e.preventDefault();
      }
    });
  });

  // Initialize TinyMCE if present on the page
  if (typeof tinymce !== 'undefined') {
    tinymce.init({
      selector: '.rich-editor',
      // Everything below is loaded from our own origin.
      base_url: '/vendor/tinymce',
      suffix: '.min',
      // Required by TinyMCE 7 for self-hosted use under its GPL licence.
      // Without it the editor renders a licence warning over the toolbar.
      license_key: 'gpl',
      promotion: false,
      branding: false,
      directionality: 'rtl',
      height: 400,
      // 'template' was removed in TinyMCE 7 (it became a paid plugin), and
      // requesting a plugin that does not exist aborts the whole init, taking
      // every other plugin down with it. The remaining names were checked
      // against node_modules/tinymce/plugins one by one.
      plugins: 'advlist autolink lists link image charmap preview anchor pagebreak searchreplace wordcount visualblocks visualchars code fullscreen insertdatetime media nonbreaking save table directionality emoticons',
      // 'formatselect' is the TinyMCE 4/5 name for this control; v6 renamed it
      // to 'blocks' and v7 no longer resolves the old name at all.
      toolbar: 'undo redo | blocks | bold italic underline strikethrough | alignleft aligncenter alignright alignjustify | outdent indent | numlist bullist | link image media | ltr rtl | fullscreen code',
      skin: document.documentElement.getAttribute('data-theme') === 'dark' ? 'oxide-dark' : 'oxide',
      content_css: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default',
      setup: function (editor) {
        editor.on('init', function () {
          // Listen for theme changes to update tinymce theme
          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              if (mutation.attributeName === 'data-theme') {
                // Changing skin dynamically in TinyMCE is complex, usually requires re-init or iframe CSS injection
                // For now, reload the page on theme change if editor is active, or just let it be.
              }
            });
          });
          observer.observe(document.documentElement, { attributes: true });
        });
      }
    });
  }
});


// ==============================================================
// PHASE 7: PREMIUM CMS IMAGE MANAGEMENT SYSTEM (DRAG & DROP)
// ==============================================================
document.addEventListener('DOMContentLoaded', () => {
    const fileInputs = document.querySelectorAll('input[type="file"][accept*="image"]');
    
    fileInputs.forEach(input => {
        // Skip if already upgraded
        if(input.dataset.premiumUploader) return;
        input.dataset.premiumUploader = 'true';
        
        const isMultiple = input.hasAttribute('multiple');
        
        // Create Uploader UI
        const dropZone = document.createElement('div');
        dropZone.className = 'premium-dropzone';
        
        const dropMessage = document.createElement('div');
        dropMessage.className = 'drop-message';
        dropMessage.innerHTML = `<span class="material-symbols-rounded">cloud_upload</span><br>
                                 <strong style="color: var(--primary-gold);">اسحب وأفلت الصور هنا لرفعها فوراً</strong><br>
                                 <small style="color: var(--text-muted); font-size: 12px;">أو اضغط لاختيار ملفات من جهازك (JPG, PNG, WebP حتى 10MB)</small>`;
                                 
        const previewContainer = document.createElement('div');
        previewContainer.className = 'preview-container';
        
        dropZone.appendChild(dropMessage);
        dropZone.appendChild(previewContainer);
        
        // Hide original input and insert dropZone
        input.style.display = 'none';
        input.parentNode.insertBefore(dropZone, input);
        
        // Handle Clicks
        dropZone.addEventListener('click', (e) => {
            if(e.target.closest('.preview-item')) return;
            input.click();
        });
        
        // Handle Drag & Drop
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });
        
        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.add('is-dragover'), false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.remove('is-dragover'), false);
        });
        
        dropZone.addEventListener('drop', handleDrop, false);
        
        let selectedFiles = []; // To keep track of files if multiple
        let isSyncing = false;
        
        function handleDrop(e) {
            const dt = e.dataTransfer;
            if (dt && dt.files && dt.files.length > 0) {
                processNewFiles(dt.files, true);
            }
        }
        
        input.addEventListener('change', function(e) {
            if (isSyncing) return;
            if (this.files && this.files.length > 0) {
                processNewFiles(this.files, false);
            }
        });
        
        function processNewFiles(files, shouldSyncToInput) {
            const validFiles = Array.from(files).filter(file => {
                if(!file.type || !file.type.startsWith('image/')) {
                    alert('نوع الملف غير مدعوم: ' + file.name);
                    return false;
                }
                if(file.size > 10 * 1024 * 1024) {
                    alert('حجم الملف كبير جداً (يجب أن يكون أقل من 10MB): ' + file.name);
                    return false;
                }
                return true;
            });

            if (validFiles.length === 0) return;
            
            if(!isMultiple) {
                selectedFiles = [validFiles[0]];
            } else {
                selectedFiles = [...selectedFiles, ...validFiles];
            }
            
            if (shouldSyncToInput) {
                syncInput();
            }
            renderPreviews();
        }
        
        function renderPreviews() {
            previewContainer.innerHTML = '';
            if(selectedFiles.length > 0) dropMessage.style.display = 'none';
            else dropMessage.style.display = 'block';
            
            selectedFiles.forEach((file, index) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const item = document.createElement('div');
                    item.className = 'preview-item';
                    item.innerHTML = `
                        <img src="${e.target.result}" alt="Preview">
                        <button type="button" class="btn-remove-preview" data-index="${index}" title="إزالة">
                            <span class="material-symbols-rounded">close</span>
                        </button>
                    `;
                    previewContainer.appendChild(item);
                };
                reader.readAsDataURL(file);
            });
        }
        
        previewContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-remove-preview');
            if(btn) {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                if (!isNaN(index) && index >= 0 && index < selectedFiles.length) {
                    selectedFiles.splice(index, 1);
                    syncInput();
                    renderPreviews();
                }
            }
        });
        
        function syncInput() {
            isSyncing = true;
            try {
                const dt = new DataTransfer();
                selectedFiles.forEach(file => dt.items.add(file));
                input.files = dt.files;
            } catch (err) {
                console.warn('DataTransfer sync warning:', err);
            } finally {
                isSyncing = false;
            }
        }
    });
});
