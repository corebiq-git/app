(() => {
            const purchaseDate = new Date(Date.UTC(2026, 7, 1));
            const validTill = new Date(Date.UTC(purchaseDate.getUTCFullYear() + 1, purchaseDate.getUTCMonth(), purchaseDate.getUTCDate()));
            const today = new Date();
            const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
            const remainingDays = Math.ceil((validTill.getTime() - todayUtc) / 86400000);
            const totalDays = Math.round((validTill.getTime() - purchaseDate.getTime()) / 86400000);
            const elapsedDays = Math.min(totalDays, Math.max(0, totalDays - remainingDays));
            const progress = totalDays ? Math.round((elapsedDays / totalDays) * 100) : 100;
            const dateFormatter = new Intl.DateTimeFormat('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                timeZone: 'UTC'
            });

            document.getElementById('licencePurchaseDate').textContent = dateFormatter.format(purchaseDate);
            document.getElementById('licenceValidTill').textContent = dateFormatter.format(validTill);

            const status = document.getElementById('licenceStatus');
            const statusText = document.getElementById('licenceStatusText');
            const daysValue = document.getElementById('licenceDaysRemaining');
            const daysHint = document.getElementById('licenceDaysHint');

            if (remainingDays < 0) {
                status.classList.add('expired');
                status.querySelector('.material-symbols-rounded').textContent = 'error';
                statusText.textContent = 'Expired';
                daysValue.textContent = `${Math.abs(remainingDays)} days ago`;
                daysHint.textContent = 'Renewal is required';
                document.getElementById('licenceProgressTitle').textContent = 'Licence validity has ended';
                document.getElementById('licenceProgressCopy').textContent = 'Contact support to renew your plan.';
            } else {
                daysValue.textContent = `${remainingDays} days`;
                daysHint.textContent = remainingDays === 1 ? 'One day remaining' : 'Until licence expiry';
                document.getElementById('licenceProgressTitle').textContent = `${progress}% of licence period elapsed`;
                document.getElementById('licenceProgressCopy').textContent = `${remainingDays} days remaining in your one-year plan.`;
            }

            const progressBar = document.querySelector('#licence-module [role="progressbar"]');
            progressBar.setAttribute('aria-valuenow', String(progress));
            document.getElementById('licenceProgressFill').style.width = `${progress}%`;
        })();
