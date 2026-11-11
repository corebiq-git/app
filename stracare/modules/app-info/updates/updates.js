window.markUpdatesRead = function() {
            const version = window.COREBIQ_APP_VERSION || 'v1.2';
            const key = window.COREBIQ_UPDATES_READ_KEY || 'corebiq-updates-viewed-version';
            try {
                localStorage.setItem(key, version);
            } catch (error) {
                console.error('Could not save app update read state:', error);
            }
            window.updateNotificationBell?.();
        }

        window.markUpdatesRead();
