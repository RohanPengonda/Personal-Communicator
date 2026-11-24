const PASSCODE_KEY = 'cc-passcode';
export const UNAUTHORIZED_EVENT = 'cc:unauthorized';

export const getPasscode = () => localStorage.getItem(PASSCODE_KEY) || '';

export const setPasscode = (passcode: string) => {
  localStorage.setItem(PASSCODE_KEY, passcode);
};

export const clearPasscode = () => {
  localStorage.removeItem(PASSCODE_KEY);
};

export const authHeaders = (): Record<string, string> => {
  const passcode = getPasscode();
  return passcode ? { 'x-app-passcode': passcode } : {};
};

// <video> and download links cannot set headers, so the passcode travels as a
// query parameter for those requests.
export const withAuth = (url?: string): string | undefined => {
  if (!url) return undefined;
  const passcode = getPasscode();
  if (!passcode) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}passcode=${encodeURIComponent(passcode)}`;
};
