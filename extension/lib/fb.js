/**
 * Firebase qua REST cho extension (MV3 cấm tải SDK từ ngoài).
 * Chỉ lưu token + uid + email; KHÔNG lưu mật khẩu.
 */
export class FbError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const AUTH_CODES = /INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_EMAIL|USER_DISABLED|TOKEN_EXPIRED|INVALID_REFRESH_TOKEN|USER_NOT_FOUND|MISSING_PASSWORD/;

export function createFb({ apiKey, dbUrl, store, fetchImpl = (...a) => fetch(...a), now = () => Date.now() }) {
  const KEY = 'fbAuth';

  async function call(url, init) {
    let res;
    try {
      res = await fetchImpl(url, init);
    } catch {
      throw new FbError('NETWORK', 'Không kết nối được máy chủ');
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      const msg = (data && ((data.error && data.error.message) || data.error)) || `HTTP ${res.status}`;
      const code = /Permission denied/i.test(msg) ? 'PERMISSION_DENIED'
        : AUTH_CODES.test(msg) || res.status === 401 ? 'AUTH'
        : 'HTTP';
      throw new FbError(code, String(msg), res.status);
    }
    return data;
  }

  const api = {
    async signIn(email, password) {
      const d = await call(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      });
      await store.set(KEY, {
        uid: d.localId, email: d.email, idToken: d.idToken, refreshToken: d.refreshToken,
        exp: now() + Number(d.expiresIn) * 1000,
      });
      return { uid: d.localId, email: d.email };
    },

    async currentUser() {
      const a = await store.get(KEY);
      return a ? { uid: a.uid, email: a.email } : null;
    },

    async signOut() {
      await store.remove(KEY);
    },

    async idToken() {
      const a = await store.get(KEY);
      if (!a) throw new FbError('AUTH', 'Chưa đăng nhập CRM', 401);
      if (a.exp - 60_000 > now()) return a.idToken;
      const d = await call(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(a.refreshToken)}`,
      });
      await store.set(KEY, { ...a, idToken: d.id_token, refreshToken: d.refresh_token, exp: now() + Number(d.expires_in) * 1000 });
      return d.id_token;
    },

    async get(path, params = {}) {
      const t = await api.idToken();
      const qs = new URLSearchParams({ ...params, auth: t });
      return call(`${dbUrl}/${path}.json?${qs}`, { method: 'GET' });
    },

    async patch(path, body) {
      const t = await api.idToken();
      return call(`${dbUrl}/${path}.json?auth=${encodeURIComponent(t)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    },
  };
  return api;
}
