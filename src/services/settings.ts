const OFFLINE_KEY = 'cc-offline-mode';

export const getOfflineMode = () => localStorage.getItem(OFFLINE_KEY) === 'true';

export const setOfflineMode = (enabled: boolean) => {
  localStorage.setItem(OFFLINE_KEY, String(enabled));
};
