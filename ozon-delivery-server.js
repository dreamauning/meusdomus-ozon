const express = require('express');
const cors = require('cors');
const https = require('https');
const tls = require('tls');
const crypto = require('crypto');

const OZON_CLIENT_ID = 'ad91b8c0-3cab-4391-89c3-03aab63ac160';
const OZON_CLIENT_SECRET = '849ac0c2d78440d0bf4f148071df66fce82f3136c3f87cc17189bb5f5c72dca2';
const OZON_AUTH_URL = 'https://xapi.ozon.ru/oauth/token';
const OZON_API_URL = 'https://api-delivery.ozon.ru';
const OZON_SCOPES = ['delivery-api.all'];
const OZON_SHIPMENT_METHOD_ID = 1020005030702880;
const OZON_DROPOFF_ADDRESS = 'Авиамоторная ул., 6 стр. 4';
const OZON_MARKUP_PERCENT = 5;
const OZON_MIN_DECLARED_VALUE = 500;
const OZON_DEBUG_KEY = 'md-diag-5f81c2';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyAKLI96MAXo4-6iOBSNjw9sX0xVQ2d35ZuGeDZmXSEljYUMCCDUaRgSPZy3TOQQYjB/exec';
const DELIVERY_POINTS_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const DELIVERY_POINTS_MAX_PAGES = 3000;
const DELIVERY_POINTS_PARALLEL = 2;
const DEFAULT_TIMEOUT_MS = 20000;
const LONG_TIMEOUT_MS = 60000;

const app = express();
app.use(cors());
app.use(express.json());

const RUSSIAN_TRUSTED_ROOT_CA = `-----BEGIN CERTIFICATE-----
MIIFwjCCA6qgAwIBAgICEAAwDQYJKoZIhvcNAQELBQAwcDELMAkGA1UEBhMCUlUx
PzA9BgNVBAoMNlRoZSBNaW5pc3RyeSBvZiBEaWdpdGFsIERldmVsb3BtZW50IGFu
ZCBDb21tdW5pY2F0aW9uczEgMB4GA1UEAwwXUnVzc2lhbiBUcnVzdGVkIFJvb3Qg
Q0EwHhcNMjIwMzAxMjEwNDE1WhcNMzIwMjI3MjEwNDE1WjBwMQswCQYDVQQGEwJS
VTE/MD0GA1UECgw2VGhlIE1pbmlzdHJ5IG9mIERpZ2l0YWwgRGV2ZWxvcG1lbnQg
YW5kIENvbW11bmljYXRpb25zMSAwHgYDVQQDDBdSdXNzaWFuIFRydXN0ZWQgUm9v
dCBDQTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAMfFOZ8pUAL3+r2n
qqE0Zp52selXsKGFYoG0GM5bwz1bSFtCt+AZQMhkWQheI3poZAToYJu69pHLKS6Q
XBiwBC1cvzYmUYKMYZC7jE5YhEU2bSL0mX7NaMxMDmH2/NwuOVRj8OImVa5s1F4U
zn4Kv3PFlDBjjSjXKVY9kmjUBsXQrIHeaqmUIsPIlNWUnimXS0I0abExqkbdrXbX
YwCOXhOO2pDUx3ckmJlCMUGacUTnylyQW2VsJIyIGA8V0xzdaeUXg0VZ6ZmNUr5Y
Ber/EAOLPb8NYpsAhJe2mXjMB/J9HNsoFMBFJ0lLOT/+dQvjbdRZoOT8eqJpWnVD
U+QL/qEZnz57N88OWM3rabJkRNdU/Z7x5SFIM9FrqtN8xewsiBWBI0K6XFuOBOTD
4V08o4TzJ8+Ccq5XlCUW2L48pZNCYuBDfBh7FxkB7qDgGDiaftEkZZfApRg2E+M9
G8wkNKTPLDc4wH0FDTijhgxR3Y4PiS1HL2Zhw7bD3CbslmEGgfnnZojNkJtcLeBH
BLa52/dSwNU4WWLubaYSiAmA9IUMX1/RpfpxOxd4Ykmhz97oFbUaDJFipIggx5sX
ePAlkTdWnv+RWBxlJwMQ25oEHmRguNYf4Zr/Rxr9cS93Y+mdXIZaBEE0KS2iLRqa
OiWBki9IMQU4phqPOBAaG7A+eP8PAgMBAAGjZjBkMB0GA1UdDgQWBBTh0YHlzlpf
BKrS6badZrHF+qwshzAfBgNVHSMEGDAWgBTh0YHlzlpfBKrS6badZrHF+qwshzAS
BgNVHRMBAf8ECDAGAQH/AgEEMA4GA1UdDwEB/wQEAwIBhjANBgkqhkiG9w0BAQsF
AAOCAgEAALIY1wkilt/urfEVM5vKzr6utOeDWCUczmWX/RX4ljpRdgF+5fAIS4vH
tmXkqpSCOVeWUrJV9QvZn6L227ZwuE15cWi8DCDal3Ue90WgAJJZMfTshN4OI8cq
W9E4EG9wglbEtMnObHlms8F3CHmrw3k6KmUkWGoa+/ENmcVl68u/cMRl1JbW2bM+
/3A+SAg2c6iPDlehczKx2oa95QW0SkPPWGuNA/CE8CpyANIhu9XFrj3RQ3EqeRcS
AQQod1RNuHpfETLU/A2gMmvn/w/sx7TB3W5BPs6rprOA37tutPq9u6FTZOcG1Oqj
C/B7yTqgI7rbyvox7DEXoX7rIiEqyNNUguTk/u3SZ4VXE2kmxdmSh3TQvybfbnXV
4JbCZVaqiZraqc7oZMnRoWrXRG3ztbnbes/9qhRGI7PqXqeKJBztxRTEVj8ONs1d
WN5szTwaPIvhkhO3CO5ErU2rVdUr89wKpNXbBODFKRtgxUT70YpmJ46VVaqdAhOZ
D9EUUn4YaeLaS8AjSF/h7UkjOibNc4qVDiPP+rkehFWM66PVnP1Msh93tc+taIfC
EYVMxjh8zNbFuoc7fzvvrFILLe7ifvEIUqSVIC/AzplM/Jxw7buXFeGP1qVCBEHq
391d/9RAfaZ12zkwFsl+IKwE/OZxW8AHa9i1p4GO0YSNuczzEm4=
-----END CERTIFICATE-----`;

const RUSSIAN_TRUSTED_SUB_CA = `-----BEGIN CERTIFICATE-----
MIIHQjCCBSqgAwIBAgICEAIwDQYJKoZIhvcNAQELBQAwcDELMAkGA1UEBhMCUlUx
PzA9BgNVBAoMNlRoZSBNaW5pc3RyeSBvZiBEaWdpdGFsIERldmVsb3BtZW50IGFu
ZCBDb21tdW5pY2F0aW9uczEgMB4GA1UEAwwXUnVzc2lhbiBUcnVzdGVkIFJvb3Qg
Q0EwHhcNMjIwMzAyMTEyNTE5WhcNMjcwMzA2MTEyNTE5WjBvMQswCQYDVQQGEwJS
VTE/MD0GA1UECgw2VGhlIE1pbmlzdHJ5IG9mIERpZ2l0YWwgRGV2ZWxvcG1lbnQg
YW5kIENvbW11bmljYXRpb25zMR8wHQYDVQQDDBZSdXNzaWFuIFRydXN0ZWQgU3Vi
IENBMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA9YPqBKOk19NFymrE
wehzrhBEgT2atLezpduB24mQ7CiOa/HVpFCDRZzdxqlh8drku408/tTmWzlNH/br
HuQhZ/miWKOf35lpKzjyBd6TPM23uAfJvEOQ2/dnKGGJbsUo1/udKSvxQwVHpVv3
S80OlluKfhWPDEXQpgyFqIzPoxIQTLZ0deirZwMVHarZ5u8HqHetRuAtmO2ZDGQn
vVOJYAjls+Hiueq7Lj7Oce7CQsTwVZeP+XQx28PAaEZ3y6sQEt6rL06ddpSdoTMp
BnCqTbxW+eWMyjkIn6t9GBtUV45yB1EkHNnj2Ex4GwCiN9T84QQjKSr+8f0psGrZ
vPbCbQAwNFJjisLixnjlGPLKa5vOmNwIh/LAyUW5DjpkCx004LPDuqPpFsKXNKpa
L2Dm6uc0x4Jo5m+gUTVORB6hOSzWnWDj2GWfomLzzyjG81DRGFBpco/O93zecsIN
3SL2Ysjpq1zdoS01CMYxie//9zWvYwzI25/OZigtnpCIrcd2j1Y6dMUFQAzAtHE+
qsXflSL8HIS+IJEFIQobLlYhHkoE3avgNx5jlu+OLYe0dF0Ykx1PGNjbwqvTX37R
Cn32NMjlotW2QcGEZhDKj+3urZizp5xdTPZitA+aEjZM/Ni71VOdiOP0igbw6asZ
2fxdozZ1TnSSYNYvNATwthNmZysCAwEAAaOCAeUwggHhMBIGA1UdEwEB/wQIMAYB
Af8CAQAwDgYDVR0PAQH/BAQDAgGGMB0GA1UdDgQWBBTR4XENCy2BTm6KSo9MI7NM
XqtpCzAfBgNVHSMEGDAWgBTh0YHlzlpfBKrS6badZrHF+qwshzCBxwYIKwYBBQUH
AQEEgbowgbcwOwYIKwYBBQUHMAKGL2h0dHA6Ly9yb3N0ZWxlY29tLnJ1L2NkcC9y
b290Y2Ffc3NsX3JzYTIwMjIuY3J0MDsGCCsGAQUFBzAChi9odHRwOi8vY29tcGFu
eS5ydC5ydS9jZHAvcm9vdGNhX3NzbF9yc2EyMDIyLmNydDA7BggrBgEFBQcwAoYv
aHR0cDovL3JlZXN0ci1wa2kucnUvY2RwL3Jvb3RjYV9zc2xfcnNhMjAyMi5jcnQw
gbAGA1UdHwSBqDCBpTA1oDOgMYYvaHR0cDovL3Jvc3RlbGVjb20ucnUvY2RwL3Jv
b3RjYV9zc2xfcnNhMjAyMi5jcmwwNaAzoDGGL2h0dHA6Ly9jb21wYW55LnJ0LnJ1
L2NkcC9yb290Y2Ffc3NsX3JzYTIwMjIuY3JsMDWgM6Axhi9odHRwOi8vcmVlc3Ry
LXBraS5ydS9jZHAvcm9vdGNhX3NzbF9yc2EyMDIyLmNybDANBgkqhkiG9w0BAQsF
AAOCAgEARBVzZls79AdiSCpar15dA5Hr/rrT4WbrOfzlpI+xrLeRPrUG6eUWIW4v
Sui1yx3iqGLCjPcKb+HOTwoRMbI6ytP/ndp3TlYua2advYBEhSvjs+4vDZNwXr/D
anbwIWdurZmViQRBDFebpkvnIvru/RpWud/5r624Wp8voZMRtj/cm6aI9LtvBfT9
cfzhOaexI/99c14dyiuk1+6QhdwKaCRTc1mdfNQmnfWNRbfWhWBlK3h4GGE9JK33
Gk8ZS8DMrkdAh0xby4xAQ/mSWAfWrBmfzlOqGyoB1U47WTOeqNbWkkoAP2ys94+s
Jg4NTkiDVtXRF6nr6fYi0bSOvOFg0IQrMXO2Y8gyg9ARdPJwKtvWX8VPADCYMiWH
h4n8bZokIrImVKLDQKHY4jCsND2HHdJfnrdL2YJw1qFskNO4cSNmZydw0Wkgjv9k
F+KxqrDKlB8MZu2Hclph6v/CZ0fQ9YuE8/lsHZ0Qc2HyiSMnvjgK5fDc3TD4fa8F
E8gMNurM+kV8PT8LNIM+4Zs+LKEV8nqRWBaxkIVJGekkVKO8xDBOG/aN62AZKHOe
GcyIdu7yNMMRihGVZCYr8rYiJoKiOzDqOkPkLOPdhtVlgnhowzHDxMHND/E2WA5p
ZHuNM/m0TXt2wTTPL7JH2YC0gPz/BvvSzjksgzU5rLbRyUKQkgU=
-----END CERTIFICATE-----`;

const TRUSTED_CA = [...tls.rootCertificates, RUSSIAN_TRUSTED_ROOT_CA, RUSSIAN_TRUSTED_SUB_CA];

var ozonCookieJar = {};

function performHttpsRequest(urlObj, bodyStr, extraHeaders, timeoutMs){
  const limitMs = timeoutMs || DEFAULT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }, extraHeaders || {}),
      ca: TRUSTED_CA,
      timeout: limitMs
    };

    const request = https.request(options, (response) => {
      let raw = '';
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => {
        resolve({ status: response.statusCode, text: raw, headers: response.headers });
      });
    });

    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Запрос не получил ответ за ' + Math.round(limitMs / 1000) + ' секунд (таймаут)'));
    });
    request.on('error', (err) => { reject(err); });

    request.write(bodyStr);
    request.end();
  });
}

async function postJsonWithTrustedCA(url, bodyObj, extraHeaders, redirectsLeft, timeoutMs){
  if (redirectsLeft === undefined) redirectsLeft = 3;
  const bodyStr = JSON.stringify(bodyObj || {});
  const urlObj = new URL(url);
  const headers = Object.assign({}, extraHeaders || {});
  if (ozonCookieJar[urlObj.hostname]) {
    headers['Cookie'] = ozonCookieJar[urlObj.hostname];
  }

  const result = await performHttpsRequest(urlObj, bodyStr, headers, timeoutMs);

  if ((result.status === 307 || result.status === 302) && redirectsLeft > 0) {
    const setCookie = result.headers['set-cookie'];
    if (setCookie && setCookie.length) {
      ozonCookieJar[urlObj.hostname] = setCookie.map(c => c.split(';')[0]).join('; ');
    }
    const location = result.headers['location'];
    if (location) {
      const nextUrl = new URL(location, url).toString();
      return postJsonWithTrustedCA(nextUrl, bodyObj, extraHeaders, redirectsLeft - 1, timeoutMs);
    }
  }

  return { status: result.status, text: result.text };
}

let cachedToken = null;
let tokenExpiresAt = 0;

async function getOzonToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const result = await postJsonWithTrustedCA(OZON_AUTH_URL, {
    client_id: OZON_CLIENT_ID,
    client_secret: OZON_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: OZON_SCOPES
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Ozon не выдал токен (статус ${result.status}): ${result.text}`);
  }

  const data = JSON.parse(result.text);
  cachedToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function ozonApiCall(endpoint, body, extraHeaders, timeoutMs) {
  const token = await getOzonToken();
  const result = await postJsonWithTrustedCA(`${OZON_API_URL}${endpoint}`, body || {}, Object.assign({
    Authorization: `Bearer ${token}`
  }, extraHeaders || {}), undefined, timeoutMs);
  let json;
  try { json = JSON.parse(result.text); } catch (e) { json = null; }
  if (result.status < 200 || result.status >= 300) {
    const err = new Error(`Ozon API ${endpoint} ответил статусом ${result.status}: ${result.text}`);
    err.ozonResponse = json;
    err.status = result.status;
    throw err;
  }
  return json;
}

let deliveryPointsCache = [];
let deliveryPointsCachedAt = 0;

async function ozonApiCallWithRetry(endpoint, body) {
  const delaysMs = [2000, 5000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await ozonApiCall(endpoint, body, null, LONG_TIMEOUT_MS);
    } catch (err) {
      const retriable = !err.status || err.status === 429 || err.status >= 500;
      if (!retriable || attempt >= delaysMs.length) throw err;
      console.warn(`[ozon] ${endpoint}: ${err.message} — повтор через ${delaysMs[attempt] / 1000} с`);
      await new Promise(resolve => setTimeout(resolve, delaysMs[attempt]));
    }
  }
}

async function fetchPointsInfo(ids) {
  try {
    return await ozonApiCallWithRetry('/v1/delivery-point/info', { delivery_point_ids: ids });
  } catch (err) {
    const message = err.ozonResponse && err.ozonResponse.error && err.ozonResponse.error.message;
    if (err.status !== 404 || !message) throw err;
    const missing = new Set((String(message).match(/\d+/g) || []).map(Number));
    const remaining = ids.filter(id => !missing.has(Number(id)));
    if (!remaining.length || remaining.length === ids.length) return { delivery_points: [] };
    return fetchPointsInfo(remaining);
  }
}

async function loadAllDeliveryPoints() {
  console.log('[ozon] Обновляем кэш пунктов выдачи...');
  const ids = [];
  let cursor;
  let pages = 0;
  do {
    const page = await ozonApiCallWithRetry('/v1/delivery-point/list', { pagination: { cursor: cursor, limit: 100 } });
    (page && Array.isArray(page.delivery_points) ? page.delivery_points : []).forEach(p => ids.push(p.delivery_point_id));
    cursor = page && page.next_cursor ? page.next_cursor : null;
    pages++;
  } while (cursor && pages < DELIVERY_POINTS_MAX_PAGES);
  if (cursor) console.warn(`[ozon] Достигнут предел ${DELIVERY_POINTS_MAX_PAGES} страниц — часть пунктов не загружена`);

  const batches = [];
  for (let i = 0; i < ids.length; i += 100) batches.push(ids.slice(i, i + 100));
  const points = [];
  for (let i = 0; i < batches.length; i += DELIVERY_POINTS_PARALLEL) {
    const chunk = batches.slice(i, i + DELIVERY_POINTS_PARALLEL);
    const responses = await Promise.all(chunk.map(fetchPointsInfo));
    responses.forEach(r => {
      (r && Array.isArray(r.delivery_points) ? r.delivery_points : []).forEach(p => {
        points.push({
          delivery_point_id: p.delivery_point_id,
          delivery_point_number: p.delivery_point_number,
          name: p.name,
          full_address: p.full_address,
          coordinates: p.coordinates ? { latitude: p.coordinates.latitude, longitude: p.coordinates.longitude } : null,
          is_active: p.is_active
        });
      });
    });
  }
  console.log(`[ozon] Кэш обновлён: ${points.length} пунктов выдачи`);
  return points;
}

let deliveryPointsLoading = null;
let deliveryPointsById = new Map();

function getAllDeliveryPoints() {
  const fresh = deliveryPointsCache.length && (Date.now() - deliveryPointsCachedAt) < DELIVERY_POINTS_CACHE_TTL_MS;
  if (fresh) return Promise.resolve(deliveryPointsCache);
  if (!deliveryPointsLoading) {
    deliveryPointsLoading = loadAllDeliveryPoints()
      .then(points => {
        deliveryPointsCache = points;
        deliveryPointsById = new Map(points.map(p => [Number(p.delivery_point_id), p]));
        deliveryPointsCachedAt = Date.now();
        return points;
      })
      .catch(err => {
        console.error('[ozon] Не удалось обновить кэш пунктов:', err.message);
        if (deliveryPointsCache.length) return deliveryPointsCache;
        throw err;
      })
      .finally(() => { deliveryPointsLoading = null; });
  }
  return deliveryPointsCache.length ? Promise.resolve(deliveryPointsCache) : deliveryPointsLoading;
}

function normalizePlace(text) {
  return String(text || '').trim().toLowerCase().replace(/ё/g, 'е')
    .replace(/^(г|город|пгт|рп|с|п|д|ст-ца|х|аул|село|поселок|деревня|станица)\.?\s+/, '')
    .replace(/\s+(г|город)\.?$/, '');
}

function regionKey(region) {
  const words = String(region || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я\s-]/g, ' ').split(/\s+/)
    .filter(w => w && ['обл', 'область', 'респ', 'республика', 'край', 'ао', 'авт', 'автономный', 'округ', 'г'].indexOf(w) === -1);
  return words[0] || '';
}

function pointsInCity(points, city, region) {
  const target = normalizePlace(city);
  let found = points.filter(p => p.is_active && addressInCity(p.full_address, city));
  if (!found.length) {
    found = points.filter(p => p.is_active && String(p.full_address || '').toLowerCase().replace(/ё/g, 'е').indexOf(target) !== -1);
  }
  const key = regionKey(region);
  if (key) {
    const inRegion = found.filter(p => String(p.full_address || '').toLowerCase().replace(/ё/g, 'е').indexOf(key) !== -1);
    if (inRegion.length) found = inRegion;
  }
  return found;
}

function addressInCity(fullAddress, city) {
  const target = normalizePlace(city);
  if (!target) return false;
  return String(fullAddress || '').split(',').some(part => normalizePlace(part) === target);
}

app.get('/api/ozon-points', async (req, res) => {
  try {
    const cityName = (req.query.city || '').trim().toLowerCase();
    if (!cityName) {
      return res.status(400).json({ error: 'Укажите город в параметре city' });
    }

    const allPoints = await getAllDeliveryPoints();
    const matched = pointsInCity(allPoints, cityName, req.query.region);

    const formatted = matched.map(p => ({
      id: 'ozon-' + p.delivery_point_id,
      city: cityName,
      name: 'Ozon Box — ' + (p.name || p.delivery_point_number || p.delivery_point_id),
      address: p.full_address,
      lat: p.coordinates ? p.coordinates.latitude : null,
      lng: p.coordinates ? p.coordinates.longitude : null,
      ozonDeliveryPointId: p.delivery_point_id
    }));

    res.json(formatted);
  } catch (err) {
    console.error('[ozon-points] Ошибка:', err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

function readAmount(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return isNaN(parseFloat(value)) ? null : parseFloat(value);
  if (value.amount !== undefined) return readAmount(value.amount);
  if (value.value !== undefined) return readAmount(value.value);
  return null;
}

function firstDefined(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

function extractPosting(resp) {
  const result = resp && Array.isArray(resp.results) ? resp.results[0] : null;
  return (result && result.posting) || result || (resp && Array.isArray(resp.postings) ? resp.postings[0] : null);
}

function ozonErrorText(err) {
  const r = err && err.ozonResponse;
  const msg = (r && (r.message || (r.error && r.error.message))) || (err && err.message) || 'неизвестная ошибка';
  return String(msg).slice(0, 160);
}

function defaultCutoffAt() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

function moscowDateAt(daysAhead, hour) {
  const now = new Date();
  const moscow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(moscow.getUTCFullYear(), moscow.getUTCMonth(), moscow.getUTCDate() + daysAhead, hour - 3, 0, 0)).toISOString();
}

function buildCheckoutBody(phone, deliveryPointId, pkg, declaredValueRub, cutoffAt) {
  return {
    recipient: { phone_number: phone },
    postings: [{
      request_id: 1,
      shipment_method_id: OZON_SHIPMENT_METHOD_ID,
      cutoff_at: cutoffAt || defaultCutoffAt(),
      declared_value: { amount: declaredValueRub.toFixed(2), currency_code: 'RUB' },
      dimensions: {
        weight_g: pkg.weightGrams,
        length_mm: pkg.lengthCm * 10,
        width_mm: pkg.widthCm * 10,
        height_mm: pkg.heightCm * 10
      }
    }],
    delivery: { delivery_point: { delivery_point_id: deliveryPointId } }
  };
}

function readCalculateParams(query) {
  return {
    phone: String(query.phone || '').trim(),
    deliveryPointId: parseInt(String(query.deliveryPointId || '').replace(/^ozon-/, ''), 10),
    pkg: {
      weightGrams: parseInt(query.weight, 10) || 500,
      lengthCm: parseInt(query.length, 10) || 20,
      widthCm: parseInt(query.width, 10) || 15,
      heightCm: parseInt(query.height, 10) || 10
    },
    declaredValueRub: parseFloat(query.declaredValue) || 0
  };
}

async function calculateOzonDelivery(params) {
  const trace = {};

  for (let attempt = 0; attempt < 2 && trace.checkClient === undefined; attempt++) {
    try {
      trace.checkClient = await ozonApiCall('/v1/delivery/check-client', { phone_number: params.phone }, null, 10000);
    } catch (err) {
      trace.checkClientError = ozonErrorText(err);
      if (err.status) break;
    }
  }
  if (trace.checkClient === undefined) {
    console.error('[ozon-calculate] check-client:', trace.checkClientError);
  }
  const eligible = firstDefined(trace.checkClient, ['can_be_delivered', 'is_available', 'available']);
  if (eligible === false) {
    return { found: false, clientNotEligible: true, error: 'нет аккаунта на Ozon', trace };
  }

  const body = buildCheckoutBody(params.phone, params.deliveryPointId, params.pkg, Math.max(params.declaredValueRub, OZON_MIN_DECLARED_VALUE));
  trace.checkoutRequest = body;
  const logRefusal = (reason) => {
    const point = deliveryPointsById.get(Number(params.deliveryPointId));
    console.error('[ozon-calculate] отказ Ozon:', reason, '| запрос:', JSON.stringify({
      pointId: params.deliveryPointId,
      pointAddress: point ? point.full_address : 'нет в кэше',
      phone: params.phone.replace(/\d(?=\d{4})/g, '*'),
      weightGrams: params.pkg.weightGrams,
      dimensionsCm: [params.pkg.lengthCm, params.pkg.widthCm, params.pkg.heightCm].join('×'),
      declaredValue: body.postings[0].declared_value.amount,
      cutoffAt: body.postings[0].cutoff_at
    }));
  };
  try {
    trace.checkout = await ozonApiCall('/v1/order/checkout', body);
  } catch (err) {
    trace.checkoutError = ozonErrorText(err);
    logRefusal(trace.checkoutError);
    return { found: false, error: 'Ozon: ' + trace.checkoutError, trace };
  }
  console.log('[ozon-calculate] checkout:', JSON.stringify(trace.checkout));

  const posting = extractPosting(trace.checkout);
  if (!posting) {
    return { found: false, error: 'Ozon не вернул расчёт', trace };
  }
  if (posting.error) {
    logRefusal(posting.error.code || posting.error.message);
    return { found: false, error: 'Ozon: ' + String(posting.error.message || posting.error).slice(0, 160), trace };
  }

  const deliveryCost = readAmount(firstDefined(posting, ['estimated_delivery_cost', 'delivery_cost', 'delivery_price', 'price']));
  if (deliveryCost === null) {
    return { found: false, error: 'Ozon не вернул стоимость', trace };
  }
  const insuranceCost = readAmount(firstDefined(posting, ['estimated_insurance_cost', 'insurance_cost'])) || 0;
  const days = firstDefined(posting, ['estimated_delivery_days', 'delivery_days', 'days']);

  return {
    found: true,
    cost: Math.round((deliveryCost + insuranceCost) * (1 + OZON_MARKUP_PERCENT / 100)),
    realCost: deliveryCost,
    insuranceCost: insuranceCost,
    periodMinDays: days,
    periodMaxDays: days,
    trace
  };
}

app.get('/api/ozon-calculate', async (req, res) => {
  const params = readCalculateParams(req.query);
  if (!params.phone) return res.json({ found: false, error: 'не указан телефон' });
  if (!params.deliveryPointId) return res.json({ found: false, error: 'не выбран пункт выдачи' });
  try {
    const result = await calculateOzonDelivery(params);
    delete result.trace;
    res.json(result);
  } catch (err) {
    console.error('[ozon-calculate] Ошибка:', err);
    res.json({ found: false, error: 'сбой сервера расчёта' });
  }
});

app.get('/api/ozon-debug', async (req, res) => {
  if (req.query.key !== OZON_DEBUG_KEY) return res.status(403).json({ error: 'forbidden' });
  const params = readCalculateParams(req.query);
  const report = { shipmentMethodId: OZON_SHIPMENT_METHOD_ID };

  try {
    if (!params.deliveryPointId && req.query.city) {
      const city = String(req.query.city).trim().toLowerCase();
      const cityPoints = pointsInCity(await getAllDeliveryPoints(), city, req.query.region);
      if (!cityPoints.length) return res.json({ error: 'В городе ' + city + ' не найдено пунктов Ozon' });
      params.deliveryPointId = cityPoints[0].delivery_point_id;
      report.deliveryPoint = { id: cityPoints[0].delivery_point_id, address: cityPoints[0].full_address };
      report.otherPoints = cityPoints.slice(1, 3).map(p => ({ id: p.delivery_point_id, address: p.full_address }));
    }
    if (!params.phone || !params.deliveryPointId) return res.json({ error: 'Нужны phone и deliveryPointId (или city)' });

    try {
      const info = await ozonApiCall('/v1/delivery-point/info', { delivery_point_ids: [params.deliveryPointId] });
      report.pointInfo = info && Array.isArray(info.delivery_points) ? info.delivery_points[0] : info;
    } catch (err) {
      report.pointInfo = { error: ozonErrorText(err) };
    }

    try {
      report.checkClient = await ozonApiCall('/v1/delivery/check-client', { phone_number: params.phone });
    } catch (err) {
      report.checkClient = { error: ozonErrorText(err), raw: err.ozonResponse || null };
    }

    const digits = params.phone.replace(/\D/g, '');
    const asIs = params.pkg;
    const minWeight = Object.assign({}, asIs, { weightGrams: Math.max(asIs.weightGrams, 100) });
    const minDims = Object.assign({}, asIs, { lengthCm: Math.max(asIs.lengthCm, 15), widthCm: Math.max(asIs.widthCm, 10), heightCm: Math.max(asIs.heightCm, 5) });
    const minBoth = Object.assign({}, minDims, { weightGrams: Math.max(asIs.weightGrams, 100) });
    const variants = [
      { name: 'как в заказе', phone: params.phone, cutoffAt: defaultCutoffAt(), declared: params.declaredValueRub, pkg: asIs },
      { name: 'отгрузка завтра 12:00 МСК', phone: params.phone, cutoffAt: moscowDateAt(1, 12), declared: params.declaredValueRub, pkg: asIs },
      { name: 'телефон без плюса', phone: digits, cutoffAt: defaultCutoffAt(), declared: params.declaredValueRub, pkg: asIs },
      { name: 'вес не меньше 100 г', phone: params.phone, cutoffAt: defaultCutoffAt(), declared: params.declaredValueRub, pkg: minWeight },
      { name: 'размер не меньше 15×10×5 см', phone: params.phone, cutoffAt: defaultCutoffAt(), declared: params.declaredValueRub, pkg: minDims },
      { name: 'вес 100 г и размер 15×10×5 см', phone: params.phone, cutoffAt: defaultCutoffAt(), declared: params.declaredValueRub, pkg: minBoth },
      { name: 'объявленная стоимость 500 ₽', phone: params.phone, cutoffAt: defaultCutoffAt(), declared: Math.max(params.declaredValueRub, 500), pkg: asIs }
    ];

    report.attempts = [];
    for (const v of variants) {
      const body = buildCheckoutBody(v.phone, params.deliveryPointId, v.pkg, v.declared, v.cutoffAt);
      const attempt = { variant: v.name, cutoff_at: v.cutoffAt };
      try {
        const resp = await ozonApiCall('/v1/order/checkout', body);
        const posting = extractPosting(resp);
        attempt.ok = !!(posting && !posting.error);
        attempt.response = resp;
      } catch (err) {
        attempt.ok = false;
        attempt.error = ozonErrorText(err);
        attempt.raw = err.ozonResponse || null;
      }
      report.attempts.push(attempt);
    }
    for (const other of (report.otherPoints || [])) {
      const attempt = { variant: 'другой пункт: ' + other.address, cutoff_at: moscowDateAt(1, 12) };
      try {
        const resp = await ozonApiCall('/v1/order/checkout', buildCheckoutBody(params.phone, other.id, params.pkg, params.declaredValueRub, attempt.cutoff_at));
        const posting = extractPosting(resp);
        attempt.ok = !!(posting && !posting.error);
        attempt.response = resp;
      } catch (err) {
        attempt.ok = false;
        attempt.error = ozonErrorText(err);
      }
      report.attempts.push(attempt);
    }
    report.requestExample = buildCheckoutBody(params.phone, params.deliveryPointId, params.pkg, params.declaredValueRub, moscowDateAt(1, 12));
    report.summary = report.attempts.some(a => a.ok)
      ? 'Сработали варианты: ' + report.attempts.filter(a => a.ok).map(a => a.variant).join(', ')
      : 'Ни один вариант не прошёл — вероятнее всего, причина на стороне настроек договора или метода доставки в Ozon';
    res.json(report);
  } catch (err) {
    report.error = String(err.message || err);
    res.json(report);
  }
});

function idempotencyKeyFromOrderNumber(orderNumber) {
  const hash = crypto.createHash('sha256').update(String(orderNumber)).digest('hex');
  return [hash.slice(0,8), hash.slice(8,12), hash.slice(12,16), hash.slice(16,20), hash.slice(20,32)].join('-');
}

async function fetchOrderFromSheet(orderNumber) {
  const url = APPS_SCRIPT_URL + '?action=order-lookup&orderNumber=' + encodeURIComponent(orderNumber);
  const response = await fetch(url);
  return await response.json();
}

async function writeTrackingToSheet(orderNumber, trackNumber) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ type: 'set-tracking', orderNumber: orderNumber, trackNumber: trackNumber })
  });
  return await response.json();
}

function htmlPage(title, bodyHtml) {
  return '<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>' + title + '</title>'
    + '<style>'
    + 'body{font-family:-apple-system,Arial,sans-serif; background:#F3F0EA; color:#2A1E15; padding:40px 20px; max-width:560px; margin:0 auto; line-height:1.6;}'
    + 'h1{font-size:22px; margin-bottom:16px;}'
    + '.card{background:#fff; border-radius:10px; padding:24px; box-shadow:0 2px 12px rgba(42,30,21,0.1);}'
    + '.ok{color:#2E7D32;} .err{color:#A83C3C;}'
    + 'a.btn{display:inline-block; margin-top:16px; background:#2A1E15; color:#fff; padding:12px 20px; border-radius:8px; text-decoration:none; font-weight:600;}'
    + '</style></head><body><div class="card">' + bodyHtml + '</div></body></html>';
}

app.get('/api/create-ozon-order', async (req, res) => {
  var orderNumber = String(req.query.orderNumber || '').trim();
  if (!orderNumber) {
    return res.status(400).send(htmlPage('Ошибка', '<h1 class="err">Не передан номер заказа</h1>'));
  }

  try {
    var order = await fetchOrderFromSheet(orderNumber);
    if (!order.found) {
      return res.send(htmlPage('Заказ не найден', '<h1 class="err">Заказ не найден</h1><p>' + (order.error || 'Проверьте номер заказа.') + '</p>'));
    }

    if (order.trackNumber) {
      return res.send(htmlPage('Уже создано', '<h1>Отправка уже была создана ранее</h1><p>Трек-номер: <b>' + order.trackNumber + '</b></p><p>Письмо покупателю уже отправлено, повторно ничего создавать не нужно.</p>'));
    }

    if (!order.ozonDeliveryPointId) {
      return res.send(htmlPage('Не хватает данных', '<h1 class="err">У этого заказа не сохранён ID пункта выдачи Ozon</h1><p>Скорее всего, заказ был оформлен до подключения этой автоматизации — создайте отправку вручную в кабинете Ozon.</p>'));
    }

    var idempotencyKey = idempotencyKeyFromOrderNumber(orderNumber);
    var cutoffAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    var itemNames = (order.items || []).map(function(i){ return i.name; }).join(', ') || ('Заказ ' + orderNumber);

    var createBody = {
      order_external_id: orderNumber,
      recipient: {
        phone_number: order.phone,
        full_name: order.name || 'Покупатель Meus Domus'
      },
      delivery: {
        delivery_point: { delivery_point_id: Number(order.ozonDeliveryPointId) }
      },
      postings: [{
        request_id: 1,
        posting_external_id: orderNumber,
        shipment_method_id: OZON_SHIPMENT_METHOD_ID,
        description: itemNames.slice(0, 160),
        declared_value: { amount: Math.max(Number(order.total || 0), OZON_MIN_DECLARED_VALUE).toFixed(2), currency_code: 'RUB' },
        cutoff_at: cutoffAt,
        dimensions: {
          weight_g: Number(order.weightGrams) || 500,
          length_mm: 200, width_mm: 150, height_mm: 100
        }
      }]
    };
    if (order.dimensionsCm && typeof order.dimensionsCm === 'string' && order.dimensionsCm.indexOf('×') !== -1) {
      var parts = order.dimensionsCm.split('×').map(function(n){ return parseInt(n, 10) * 10; });
      if (parts.length === 3 && parts.every(function(n){ return !isNaN(n); })) {
        createBody.postings[0].dimensions.length_mm = parts[0];
        createBody.postings[0].dimensions.width_mm = parts[1];
        createBody.postings[0].dimensions.height_mm = parts[2];
      }
    }

    console.log('[create-ozon-order] Создаём заказ ' + orderNumber + ':', JSON.stringify(createBody));
    var createResp = await ozonApiCall('/v1/order/create', createBody, { 'Idempotency-Key': idempotencyKey });
    console.log('[create-ozon-order] Ответ order/create:', JSON.stringify(createResp));

    var posting = createResp && createResp.postings && createResp.postings[0];
    if (!posting || !posting.posting_number) {
      return res.send(htmlPage('Ошибка создания', '<h1 class="err">Ozon не создал отправление</h1><pre>' + JSON.stringify(createResp) + '</pre>'));
    }
    var postingNumber = posting.posting_number;

    console.log('[create-ozon-order] Подтверждаем отправление ' + postingNumber);
    await ozonApiCall('/v1/posting/approve', { posting_number: postingNumber });

    var labelResp = await ozonApiCall('/v1/posting/label', { posting_number: postingNumber });
    var labelBase64 = labelResp && labelResp.file_content;

    await writeTrackingToSheet(orderNumber, postingNumber);

    var labelHtml = '<p>Этикетку не удалось получить автоматически — найдите отправление ' + postingNumber + ' в личном кабинете Ozon и распечатайте её оттуда.</p>';
    if (labelBase64) {
      labelHtml = '<a class="btn" href="data:application/pdf;base64,' + labelBase64 + '" download="ozon-' + postingNumber + '.pdf">Скачать этикетку (PDF)</a>';
    }

    res.send(htmlPage('Готово',
      '<h1 class="ok">Отправка создана</h1>'
      + '<p>Номер отправления Ozon: <b>' + postingNumber + '</b></p>'
      + '<p>Трек-номер записан в таблицу — покупателю уже отправлено письмо с ним.</p>'
      + labelHtml
      + '<p style="margin-top:20px; font-size:14px; color:#6b5d4f;">Довезите посылку с этой этикеткой до пункта отгрузки Ozon (' + OZON_DROPOFF_ADDRESS + ').</p>'
    ));
  } catch (err) {
    console.error('[create-ozon-order] Ошибка:', err);
    res.status(500).send(htmlPage('Ошибка', '<h1 class="err">Что-то пошло не так</h1><p>' + String(err.message || err) + '</p><p>Заказ ' + orderNumber + ' нужно будет создать вручную в кабинете Ozon.</p>'));
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер Ozon Delivery запущен на порту ${PORT}`);
  getAllDeliveryPoints().catch(err => console.error('[ozon] Не удалось прогреть кэш при старте:', err.message));
});
