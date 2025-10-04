export const getAuthIdToken = (): string | null => {
  try {
    return localStorage.getItem('idToken');
  } catch {
    return null;
  }
};

export default { getAuthIdToken };
