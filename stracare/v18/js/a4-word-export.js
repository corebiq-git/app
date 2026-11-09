function safeFileName(value) {
    return String(value || 'Document')
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
        .replace(/\s+/g, '_')
        .replace(/-+/g, '-')
        .replace(/^[.]+|[.]+$/g, '') || 'Document';
}

function dataUrlFromBlob(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('Could not embed a document image.'));
        reader.readAsDataURL(blob);
    });
}

async function embedImages(root) {
    await Promise.all([...root.querySelectorAll('img[src]')].map(async image => {
        try {
            const response = await fetch(new URL(image.getAttribute('src'), document.baseURI));
            if (!response.ok) throw new Error(`Image request failed with status ${response.status}.`);
            image.src = await dataUrlFromBlob(await response.blob());
        } catch (error) {
            console.warn(`Could not embed Word document image "${image.getAttribute('src')}":`, error);
            image.removeAttribute('src');
        }
    }));
}

function replaceFormControls(root) {
    root.querySelectorAll('input, textarea, select').forEach(control => {
        const value = control instanceof HTMLSelectElement
            ? control.selectedOptions[0]?.textContent || ''
            : control.value;
        const text = document.createElement('span');
        text.className = `${control.className || ''} word-form-value`;
        text.textContent = value;
        text.style.cssText = control.getAttribute('style') || '';
        text.style.whiteSpace = 'pre-wrap';
        if (control instanceof HTMLTextAreaElement) {
            text.style.display = 'block';
            text.style.width = '100%';
        }
        control.replaceWith(text);
    });
    root.querySelectorAll('[contenteditable]').forEach(element => {
        element.removeAttribute('contenteditable');
    });
}

function copyFormControlValues(source, clone) {
    const sourceControls = [...source.querySelectorAll('input, textarea, select')];
    const clonedControls = [...clone.querySelectorAll('input, textarea, select')];
    clonedControls.forEach((control, index) => {
        const original = sourceControls[index];
        if (!original) return;
        if (control instanceof HTMLInputElement && original instanceof HTMLInputElement) {
            control.value = original.value;
            control.checked = original.checked;
        } else if (control instanceof HTMLTextAreaElement && original instanceof HTMLTextAreaElement) {
            control.value = original.value;
            control.textContent = original.value;
        } else if (control instanceof HTMLSelectElement && original instanceof HTMLSelectElement) {
            control.selectedIndex = original.selectedIndex;
        }
    });
}

let html2pdfLoadPromise;

async function ensureHtml2Pdf() {
    if (typeof window.html2pdf === 'function') return;
    if (!html2pdfLoadPromise) {
        html2pdfLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
            script.crossOrigin = 'anonymous';
            script.referrerPolicy = 'no-referrer';
            script.onload = () => {
                if (typeof window.html2pdf === 'function') resolve();
                else reject(new Error('The PDF export library loaded but is unavailable.'));
            };
            script.onerror = () => reject(new Error('Could not load the PDF export library.'));
            document.head.appendChild(script);
        });
    }
    try {
        await html2pdfLoadPromise;
    } catch (error) {
        html2pdfLoadPromise = undefined;
        throw error;
    }
}

export async function downloadA4WordDocument(container, fileName) {
    const source = typeof container === 'string' ? document.getElementById(container) : container;
    if (!(source instanceof HTMLElement)) throw new Error('The document preview is not available.');

    const page = source.cloneNode(true);
    copyFormControlValues(source, page);
    page.querySelectorAll('script, .no-print, button').forEach(element => element.remove());
    page.querySelectorAll('style').forEach(element => element.remove());
    replaceFormControls(page);
    await embedImages(page);

    let pageContent = page;
    const moduleRoot = source.closest('.module-container');
    if (moduleRoot && source !== moduleRoot) {
        const wrapper = document.createElement('div');
        wrapper.id = moduleRoot.id;
        wrapper.className = moduleRoot.className;
        wrapper.appendChild(page);
        pageContent = wrapper;
    }

    const styles = [
        ...document.head.querySelectorAll('style'),
        ...(moduleRoot?.parentElement?.querySelectorAll('style') || []),
        ...(moduleRoot?.querySelectorAll('style') || [])
    ]
        .map(style => style.textContent)
        .join('\n');
    const pageSizing = `
        @page Section1 { size: 595.3pt 841.9pt; margin: 0; }
        div.Section1 { page: Section1; }
        html, body { width: 210mm; height: 297mm; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; }
        .a4-word-page { width: 210mm; min-height: 297mm; overflow: visible; page-break-after: auto; }
        #invoice-container, #letterhead-module .a4-canvas {
            width: 210mm !important; height: 297mm !important; min-height: 297mm !important;
            max-height: 297mm !important; margin: 0 !important; overflow: hidden !important;
            box-sizing: border-box !important;
        }
        img { max-width: 100%; }
        .word-form-value { display: inline-block; min-height: 1em; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; white-space: pre-wrap; vertical-align: baseline; }
    `;
    const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="ProgId" content="Word.Document">
<title>${safeFileName(fileName).replace(/\.doc$/i, '')}</title>
<style>${pageSizing}\n${styles}</style>
</head>
<body><div class="Section1"><div class="a4-word-page">${pageContent.outerHTML}</div></div></body>
</html>`;
    const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = safeFileName(fileName).replace(/\.doc$/i, '') + '.doc';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function downloadA4PdfDocument(container, fileName) {
    const source = typeof container === 'string' ? document.getElementById(container) : container;
    if (!(source instanceof HTMLElement)) throw new Error('The document preview is not available.');
    await ensureHtml2Pdf();

    const moduleRoot = source.closest('.module-container');
    const page = (moduleRoot || source).cloneNode(true);
    copyFormControlValues(moduleRoot || source, page);
    page.querySelectorAll('script, .no-print, button').forEach(element => element.remove());
    replaceFormControls(page);
    await embedImages(page);
    Object.assign(page.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        width: '210mm',
        maxWidth: 'none',
        margin: '0',
        padding: '0',
        background: '#ffffff',
        zIndex: '2147483000',
        visibility: 'hidden',
        pointerEvents: 'none'
    });
    const exportId = `a4-pdf-export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    page.dataset.a4PdfExportId = exportId;
    const canvas = moduleRoot ? page.querySelector('.a4-canvas') : page;
    if (!(canvas instanceof HTMLElement)) throw new Error('The A4 page is not available.');
    Object.assign(canvas.style, {
        width: '210mm',
        height: '297mm',
        minHeight: '297mm',
        maxHeight: '297mm',
        maxWidth: 'none',
        margin: '0',
        overflow: 'hidden',
        boxSizing: 'border-box'
    });
    document.body.appendChild(page);
    try {
        await window.html2pdf().set({
            margin: 0,
            filename: `${safeFileName(fileName).replace(/\.pdf$/i, '')}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                onclone: clonedDocument => {
                    const clonedPage = clonedDocument.querySelector(`[data-a4-pdf-export-id="${exportId}"]`);
                    if (clonedPage) clonedPage.style.visibility = 'visible';
                },
                windowWidth: 794,
                windowHeight: 1123,
                width: 794,
                height: 1123,
                scrollX: 0,
                scrollY: 0
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'] }
        }).from(page).save();
    } finally {
        page.remove();
    }
}
