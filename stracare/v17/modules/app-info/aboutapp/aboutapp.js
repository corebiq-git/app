(() => {
                const copyrightYear = document.querySelector('[data-copyright-year]');
                if (copyrightYear) {
                    copyrightYear.textContent = new Date().getFullYear();
                }
            })();
