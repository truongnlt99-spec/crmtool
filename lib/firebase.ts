import { createSign } from 'node:crypto';

/**
 * Lớp truy cập Firebase Realtime Database qua REST API.
 *
 * Hỗ trợ 2 chế độ xác thực:
 *  1. Không xác thực — dùng khi database còn đang mở công khai (tình trạng hiện tại).
 *  2. Service account — sau khi siết Security Rules, đặt biến môi trường
 *     FIREBASE_SERVICE_ACCOUNT (nội dung file JSON service account) thì tự động
 *     dùng OAuth2 để có quyền admin, bỏ qua rules.
 *
 * Không dùng firebase-admin để giữ cold start nhẹ; luồng JWT -> access token
 * được cài trực tiếp bằng node:crypto.
 */

const DB_URL = (
  process.env.FIREBASE_DB_URL ||
  'https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app'
).replace(/\/$/, '');

/**
 * Nhánh gốc chứa dữ liệu CRM. Mặc định là 'crmData' — trùng với app web.
 * Đổi sang nhánh khác (vd 'crmDataTest') để chạy thử các tool ghi mà không
 * đụng vào dữ liệu thật.
 */
export const DATA_ROOT = process.env.FIREBASE_DATA_ROOT || 'crmData';

const SCOPES = [
  'https://www.googleapis.com/auth/firebase.database',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

let cachedToken: { token: string; expiresAt: number } | null = null;

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Trả về access token nếu có cấu hình service account, ngược lại trả null. */
async function getAccessToken(): Promise<string | null> {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;

  // Còn hạn ít nhất 1 phút thì dùng lại token đã cache (giữa các lần gọi trong cùng instance)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  let sa: { client_email: string; private_key: string };
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT không phải JSON hợp lệ. Hãy dán nguyên nội dung file JSON service account tải từ Firebase Console.'
    );
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT thiếu client_email hoặc private_key.');
  }

  // Env var trên một số nền tảng giữ nguyên "\n" dạng ký tự -> đổi lại thành xuống dòng thật
  const privateKey = sa.private_key.replace(/\\n/g, '\n');

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPES,
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    })
  );

  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const jwt = `${header}.${claim}.${base64url(signer.sign(privateKey))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    throw new Error(`Không lấy được access token Firebase (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const token = await getAccessToken();
  const url = `${DB_URL}/${path.replace(/^\//, '')}.json`;

  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Firebase từ chối truy cập (${res.status}). Nhiều khả năng Security Rules đã siết nhưng chưa đặt biến môi trường FIREBASE_SERVICE_ACCOUNT trên Vercel. Chi tiết: ${body}`
      );
    }
    throw new Error(`Firebase lỗi ${res.status}: ${body}`);
  }

  return res.json();
}

/** Đọc dữ liệu tại một đường dẫn. */
export function readPath<T = unknown>(path: string): Promise<T> {
  return request(path) as Promise<T>;
}

/**
 * Cập nhật một phần dữ liệu tại đường dẫn (merge, không xóa key khác).
 * Luôn dùng PATCH thay vì PUT để không ghi đè mất dữ liệu do app web ghi song song.
 */
export function patchPath(path: string, data: unknown): Promise<unknown> {
  return request(path, { method: 'PATCH', body: JSON.stringify(data) });
}

/** Ghi đè toàn bộ dữ liệu tại đường dẫn. Chỉ dùng cho nhánh lá đã xác định rõ. */
export function putPath(path: string, data: unknown): Promise<unknown> {
  return request(path, { method: 'PUT', body: JSON.stringify(data) });
}
