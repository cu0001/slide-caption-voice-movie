import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const authError = (message) => Object.assign(new Error(message), { statusCode: 401 });

// Cloud Run（Irodori-TTS）を呼ぶための ID トークン。ローカル ADC（authorized_user）と
// サービスアカウント JSON に対応する。認証情報とトークンは Node 側だけで扱い、画面には渡さない。
export const createGoogleAuth = ({ env = process.env, home = os.homedir(), platform = process.platform,
  readFile = fs.readFileSync, exists = fs.existsSync, fetcher = (...args) => fetch(...args) } = {}) => {
  let credentials;
  const idTokens = new Map();
  const pending = new Map();

  const signAssertion = (credential, claims) => {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claim = Buffer.from(JSON.stringify({ iss: credential.client_email, aud: TOKEN_URL, iat: now, exp: now + 3600, ...claims })).toString('base64url');
    const input = `${header}.${claim}`;
    const signature = crypto.createSign('RSA-SHA256').update(input).sign(credential.private_key).toString('base64url');
    return `${input}.${signature}`;
  };

  const loadCredentials = () => {
    if (credentials) return credentials;
    const localKey = path.resolve('voice/service-account.json');
    const adcDir = env.CLOUDSDK_CONFIG || (platform === 'win32'
      ? path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'gcloud')
      : path.join(home, '.config', 'gcloud'));
    const filename = env.GOOGLE_APPLICATION_CREDENTIALS || (exists(localKey) ? localKey : path.join(adcDir, 'application_default_credentials.json'));
    let parsed;
    try { parsed = JSON.parse(readFile(filename, 'utf8')); }
    catch { throw authError('Google Cloud認証を読み込めません。gcloud auth application-default login を実行するか、サービスアカウント鍵を設定してください。'); }
    // Older project keys may omit "type" but still contain all SA fields.
    const type = parsed.type || (parsed.private_key && parsed.client_email ? 'service_account' : undefined);
    if (type === 'authorized_user' && parsed.client_id && parsed.client_secret && parsed.refresh_token
      || type === 'service_account' && parsed.private_key && parsed.client_email) {
      credentials = { ...parsed, type };
      return credentials;
    }
    throw authError('この認証形式には未対応です。ユーザーADCまたはサービスアカウントJSONを指定してください。');
  };

  // ユーザーADCは更新時の id_token、サービスアカウントは target_audience 付きの JWT で取得する。
  const requestIdToken = async (audience) => {
    const credential = loadCredentials();
    const form = credential.type === 'authorized_user'
      ? { grant_type: 'refresh_token', client_id: credential.client_id,
        client_secret: credential.client_secret, refresh_token: credential.refresh_token }
      : { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: signAssertion(credential, { target_audience: audience }) };
    const response = await fetcher(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form), signal: AbortSignal.timeout(30_000) });
    const result = await response.json();
    if (!response.ok || !result.id_token) throw authError(`IDトークンを取得できません（HTTP ${response.status}）。gcloud auth application-default login で再認証してください。`);
    idTokens.set(audience, { token: result.id_token, expiresAt: Date.now() + 3600 * 1000 });
    return result.id_token;
  };

  return {
    // 並列の音声リクエストは 1 回のトークン取得を共有し、期限の 1 分前までは使い回す。
    async getIdToken(audience) {
      const cached = idTokens.get(audience);
      if (cached?.expiresAt > Date.now() + 60_000) return cached.token;
      if (!pending.has(audience)) pending.set(audience, requestIdToken(audience).finally(() => pending.delete(audience)));
      return pending.get(audience);
    },
    invalidate() { idTokens.clear(); },
  };
};
