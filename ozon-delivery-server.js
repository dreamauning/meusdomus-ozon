/**
 * MEUS DOMUS — сервер для интеграции с Ozon Delivery API (Ozon Доставка
 * для бизнеса)
 * ================================================================
 * ЗАЧЕМ ЭТОТ ФАЙЛ:
 * Тот же принцип, что и у сервера СДЭК и сервера Тинькофф — client_id и
 * client_secret нельзя вставлять в код сайта (их увидел бы кто угодно
 * через "Просмотр кода страницы"), поэтому они живут только здесь.
 *
 * ==================== ВАЖНО: ЭТА ИНТЕГРАЦИЯ УСТРОЕНА ИНАЧЕ, ЧЕМ СДЭК ===
 * У Ozon Delivery API другая архитектура — не просто "город → цена":
 *
 * 1. РАСЧЁТ ЦЕНЫ ТРЕБУЕТ ТЕЛЕФОН ПОКУПАТЕЛЯ. Метод, который считает
 *    стоимость (order/checkout), обязательно требует номер телефона
 *    получателя — доставка Ozon в принципе работает только для
 *    покупателей, у которых уже есть аккаунт на Ozon. Показать цену
 *    "просто по городу, без телефона" здесь невозможно технически —
 *    это не наша прихоть, а требование самого API.
 *
 * 2. СПИСОК ПУНКТОВ ВЫДАЧИ НЕ ФИЛЬТРУЕТСЯ ПО ГОРОДУ ЧЕРЕЗ API — метод
 *    delivery-point/list отдаёт вообще все пункты постранично, без
 *    параметра "город". Сервер сам кэширует полный список и фильтрует
 *    по тексту адреса на своей стороне.
 *
 * 3. ТРЕБУЕТСЯ РАЗОВАЯ НАСТРОЙКА ПЕРЕД ЗАПУСКОМ — нужно один раз создать
 *    "метод доставки" (shipment method), привязанный к ВАШЕМУ пункту
 *    отгрузки (куда вы физически сдаёте посылки Ozon) и пункту для
 *    возвратов. Без этого расчёт цены работать не будет вообще — Ozon
 *    попросту не поймёт, от какого склада считать доставку.
 *    См. инструкцию по разовой настройке в конце этого файла.
 * ========================================================================
 *
 * КАК ЗАПУСТИТЬ:
 * 1. npm init -y && npm install express cors
 * 2. Впишите ниже OZON_CLIENT_ID и OZON_CLIENT_SECRET
 * 3. Разместите на Render (или другом хостинге с Node.js)
 * 4. Выполните РАЗОВУЮ НАСТРОЙКУ (см. инструкцию в конце файла) — получите
 *    shipment_method_id и впишите его в переменную OZON_SHIPMENT_METHOD_ID
 * 5. После этого впишите адрес этого сервера в код сайта (Блок 1b)
 */

const express = require('express');
const cors = require('cors');
const https = require('https');
const tls = require('tls');

const app = express();
app.use(cors());
app.use(express.json());

/* ==================== РОССИЙСКИЙ СЕРТИФИКАТ МИНЦИФРЫ ====================
 * НАЙДЕНА ТА ЖЕ ПРИЧИНА, что уже чинили у сервера Тинькофф: "fetch failed"
 * без деталей — типичный признак того, что российский домен (здесь —
 * xapi.ozon.ru и api-delivery.ozon.ru) использует сертификат Russian
 * Trusted CA (Минцифры), которому Node.js не доверяет по умолчанию.
 * Встроенный fetch() не даёт удобного способа подсунуть свой список
 * доверенных сертификатов — поэтому, как и в сервере Тинькофф, здесь
 * используется вместо него старый добрый модуль https с явно указанным
 * списком доверенных сертификатов: обычные мировые (по умолчанию) +
 * российский Минцифры — то есть ДОБАВЛЯЕМ доверие, а не заменяем. */
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

/* Замена fetch() на встроенный https-модуль с расширенным списком
   доверенных сертификатов — та же проверенная схема, что и в сервере
   Тинькофф. Возвращает {status, json} — вызывающий код сам решает, что
   делать со статусом (fetch() бросал исключение только на сетевом сбое,
   но не на HTTP-ошибках вроде 400 — здесь сохранено то же поведение). */
/* ===== COOKIE ОТ ЗАЩИТЫ OZON ОТ DDoS (testcookie) =====
   По документации Ozon: серверы защищены модулем testcookie — на первый
   запрос к методу отвечают HTTP-редиректом (302/307) с заголовками
   Location и Set-Cookie; нужно повторить ТОТ ЖЕ запрос по адресу из
   Location, приложив полученную Cookie — и сохранить её для следующих
   запросов, чтобы не проходить эту проверку каждый раз заново.
   Храним по одной cookie на хост (xapi.ozon.ru и api-delivery.ozon.ru —
   разные хосты, разные cookie). */
var ozonCookieJar = {};

function performHttpsRequest(urlObj, bodyStr, extraHeaders){
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
      timeout: 20000
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
      reject(new Error('Запрос не получил ответ за 20 секунд (таймаут)'));
    });
    request.on('error', (err) => { reject(err); });

    request.write(bodyStr);
    request.end();
  });
}

async function postJsonWithTrustedCA(url, bodyObj, extraHeaders, redirectsLeft){
  if (redirectsLeft === undefined) redirectsLeft = 3;
  const bodyStr = JSON.stringify(bodyObj || {});
  const urlObj = new URL(url);
  const headers = Object.assign({}, extraHeaders || {});
  if (ozonCookieJar[urlObj.hostname]) {
    headers['Cookie'] = ozonCookieJar[urlObj.hostname];
  }

  const result = await performHttpsRequest(urlObj, bodyStr, headers);

  if ((result.status === 307 || result.status === 302) && redirectsLeft > 0) {
    const setCookie = result.headers['set-cookie'];
    if (setCookie && setCookie.length) {
      // Set-Cookie может прийти несколькими строками — сохраняем все,
      // склеенные через "; ", как и положено в заголовке Cookie запроса.
      ozonCookieJar[urlObj.hostname] = setCookie.map(c => c.split(';')[0]).join('; ');
    }
    const location = result.headers['location'];
    if (location) {
      const nextUrl = new URL(location, url).toString(); // на случай относительного пути
      return postJsonWithTrustedCA(nextUrl, bodyObj, extraHeaders, redirectsLeft - 1);
    }
  }

  return { status: result.status, text: result.text };
}

// ===== ВАШИ ДАННЫЕ ОТ OZON =====
const OZON_CLIENT_ID = 'ad91b8c0-3cab-4391-89c3-03aab63ac160';
const OZON_CLIENT_SECRET = '849ac0c2d78440d0bf4f148071df66fce82f3136c3f87cc17189bb5f5c72dca2';

const OZON_AUTH_URL = 'https://xapi.ozon.ru/oauth/token';
const OZON_API_URL = 'https://api-delivery.ozon.ru';

// ===== РАЗОВАЯ НАСТРОЙКА: ID МЕТОДА ДОСТАВКИ =====
// ВАЖНО: пока здесь стоит null, расчёт цены и показ пунктов выдачи
// работать НЕ БУДУТ — сервер честно ответит ошибкой с понятным текстом,
// а не сломает сайт молча. Чтобы получить это значение — см. инструкцию
// по разовой настройке в самом низу этого файла, там всё по шагам.
const OZON_SHIPMENT_METHOD_ID = null; // ← впишите сюда число после разовой настройки

// ===== ТОКЕН ДОСТУПА: получаем и кэшируем =====
let cachedToken = null;
let tokenExpiresAt = 0;

// Нужные скоупы — по списку разрешений, которые вам выдали в приложении
// ВАЖНО: раньше здесь был перечислен список отдельных разрешений
// (delivery-api.delivery, delivery-api.dropoff-point и т.д.) — Ozon
// ответил ошибкой "scope 'delivery-api.dropoff-point' is not approved"
// на один из них, хотя в панели приложения все они значились как выданные.
// Самый надёжный вариант — запросить delivery-api.all целиком: это
// разрешение точно есть (было явно в списке при создании приложения) и
// покрывает вообще все методы, включая все перечисленные по отдельности.
const OZON_SCOPES = ['delivery-api.all'];

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

async function ozonApiCall(endpoint, body) {
  const token = await getOzonToken();
  const result = await postJsonWithTrustedCA(`${OZON_API_URL}${endpoint}`, body || {}, {
    Authorization: `Bearer ${token}`
  });
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

// ===== КЭШ ПУНКТОВ ВЫДАЧИ =====
// delivery-point/list не умеет фильтровать по городу — забираем ВСЕ
// страницы один раз и держим в памяти, обновляя раз в несколько часов
// (список пунктов не меняется поминутно, нет смысла запрашивать заново
// на каждый чих покупателя).
let deliveryPointsCache = [];
let deliveryPointsCachedAt = 0;
const DELIVERY_POINTS_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 часа

async function getAllDeliveryPoints() {
  const now = Date.now();
  if (deliveryPointsCache.length && (now - deliveryPointsCachedAt) < DELIVERY_POINTS_CACHE_TTL_MS) {
    return deliveryPointsCache;
  }

  console.log('[ozon] Обновляем кэш пунктов выдачи...');
  let allPoints = [];
  let cursor = undefined;
  let pageGuard = 0; // защита от бесконечного цикла, если Ozon вдруг зациклит курсор

  do {
    const page = await ozonApiCall('/v1/delivery-point/list', {
      pagination: { cursor: cursor, limit: 100 }
    });
    if (page && Array.isArray(page.delivery_points)) {
      allPoints = allPoints.concat(page.delivery_points);
    }
    cursor = page && page.next_cursor ? page.next_cursor : null;
    pageGuard++;
  } while (cursor && pageGuard < 200); // 200 страниц по 100 = 20000 пунктов, с большим запасом

  // Список пунктов из /v1/delivery-point/list содержит только id — полные
  // данные (адрес, координаты, график) нужно дозапросить отдельно, но это
  // может быть МНОГО пунктов сразу — Ozon разрешает не больше 100 id за раз
  // в /v1/delivery-point/info, поэтому запрашиваем пачками.
  var fullPoints = [];
  for (let i = 0; i < allPoints.length; i += 100) {
    const batchIds = allPoints.slice(i, i + 100).map(p => p.delivery_point_id);
    if (!batchIds.length) continue;
    const infoResp = await ozonApiCall('/v1/delivery-point/info', { delivery_point_ids: batchIds });
    if (infoResp && Array.isArray(infoResp.delivery_points)) {
      fullPoints = fullPoints.concat(infoResp.delivery_points);
    }
  }

  deliveryPointsCache = fullPoints;
  deliveryPointsCachedAt = now;
  console.log(`[ozon] Кэш обновлён: ${fullPoints.length} пунктов выдачи`);
  return deliveryPointsCache;
}

// ===== ЭНДПОИНТ: ПУНКТЫ ВЫДАЧИ ПО ГОРОДУ =====
app.get('/api/ozon-points', async (req, res) => {
  try {
    const cityName = (req.query.city || '').trim().toLowerCase();
    if (!cityName) {
      return res.status(400).json({ error: 'Укажите город в параметре city' });
    }

    const allPoints = await getAllDeliveryPoints();
    // Фильтруем по вхождению названия города в полный адрес пункта —
    // единственный доступный способ, раз у Ozon нет отдельного поля "город"
    // и нет фильтра по городу в самом API.
    const matched = allPoints.filter(p =>
      p.is_active && (p.full_address || '').toLowerCase().indexOf(cityName) !== -1
    );

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

// ===== ЭНДПОИНТ: РАСЧЁТ РЕАЛЬНОЙ СТОИМОСТИ ДОСТАВКИ =====
// ВАЖНО: требует phone (номер телефона покупателя) — без него Ozon в
// принципе не считает доставку, см. пояснение вверху файла.
app.get('/api/ozon-calculate', async (req, res) => {
  try {
    if (!OZON_SHIPMENT_METHOD_ID) {
      console.error('[ozon-calculate] OZON_SHIPMENT_METHOD_ID не настроен — см. инструкцию по разовой настройке внизу файла');
      return res.json({ found: false, error: 'Метод доставки Ozon ещё не настроен на сервере' });
    }

    const phone = (req.query.phone || '').trim();
    const deliveryPointIdRaw = (req.query.deliveryPointId || '').trim();
    const weightGrams = parseInt(req.query.weight, 10) || 500;
    const lengthCm = parseInt(req.query.length, 10) || 20;
    const widthCm = parseInt(req.query.width, 10) || 15;
    const heightCm = parseInt(req.query.height, 10) || 10;
    const declaredValueRub = parseFloat(req.query.declaredValue) || 0;

    if (!phone) {
      return res.json({ found: false, error: 'Не передан телефон покупателя' });
    }
    if (!deliveryPointIdRaw) {
      return res.json({ found: false, error: 'Не выбран пункт выдачи' });
    }
    const deliveryPointId = parseInt(deliveryPointIdRaw.replace(/^ozon-/, ''), 10);

    // Шаг 1: проверяем, что покупатель вообще может получать доставку Ozon
    // (у него должен быть аккаунт на Ozon) — честно говорим сайту, если нет,
    // а не притворяемся, что доставка возможна.
    let clientCheck;
    try {
      clientCheck = await ozonApiCall('/v1/delivery/check-client', { phone_number: phone });
    } catch (checkErr) {
      console.error('[ozon-calculate] Ошибка проверки клиента:', checkErr.message);
      return res.json({ found: false, error: 'Не удалось проверить доступность доставки для этого номера' });
    }
    if (!clientCheck || !clientCheck.can_be_delivered) {
      return res.json({
        found: false,
        error: 'Доставка Ozon недоступна для этого номера телефона (нет аккаунта на Ozon)',
        clientNotEligible: true
      });
    }

    // Шаг 2: считаем цену через order/checkout
    const cutoffAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // ближайшая отгрузка — завтра
    const requestBody = {
      recipient: { phone_number: phone },
      postings: [{
        request_id: 1,
        shipment_method_id: OZON_SHIPMENT_METHOD_ID,
        cutoff_at: cutoffAt,
        declared_value: { amount: declaredValueRub.toFixed(2), currency_code: 'RUB' },
        dimensions: {
          weight_g: weightGrams,
          length_mm: lengthCm * 10,
          width_mm: widthCm * 10,
          height_mm: heightCm * 10
        }
      }],
      delivery: { delivery_point: { delivery_point_id: deliveryPointId } }
    };

    console.log(`[ozon-calculate] Запрос checkout: телефон=${phone}, пункт=${deliveryPointId}, вес=${weightGrams}г, габариты=${lengthCm}×${widthCm}×${heightCm}см, объявл.стоимость=${declaredValueRub}₽`);

    let checkoutResp;
    try {
      checkoutResp = await ozonApiCall('/v1/order/checkout', requestBody);
    } catch (checkoutErr) {
      console.error('[ozon-calculate] Ошибка checkout:', checkoutErr.message, checkoutErr.ozonResponse || '');
      return res.json({ found: false, error: 'Не удалось рассчитать доставку' });
    }

    console.log('[ozon-calculate] Сырой ответ checkout:', JSON.stringify(checkoutResp));

    const result = checkoutResp && Array.isArray(checkoutResp.results) ? checkoutResp.results[0] : null;
    if (!result || !result.posting || result.posting.error) {
      const errMsg = result && result.posting && result.posting.error ? result.posting.error.message : 'неизвестная ошибка';
      console.error('[ozon-calculate] Ozon вернул ошибку по отправлению:', errMsg);
      return res.json({ found: false, error: errMsg });
    }

    const deliveryCost = parseFloat(result.posting.estimated_delivery_cost && result.posting.estimated_delivery_cost.amount || 0);
    const insuranceCost = parseFloat(result.posting.estimated_insurance_cost && result.posting.estimated_insurance_cost.amount || 0);

    // ===== ТА ЖЕ НАЦЕНКА, ЧТО И У СДЭК =====
    // См. пояснение в сервере СДЭК (CDEK_MARKUP_PERCENT) — тот же принцип,
    // то же значение, для единообразия между службами доставки.
    const OZON_MARKUP_PERCENT = 5;
    const totalRealCost = deliveryCost + insuranceCost;
    const costWithMarkup = Math.round(totalRealCost * (1 + OZON_MARKUP_PERCENT / 100));

    res.json({
      found: true,
      cost: costWithMarkup,
      periodMinDays: result.posting.estimated_delivery_days,
      periodMaxDays: result.posting.estimated_delivery_days
    });
  } catch (err) {
    console.error('[ozon-calculate] Ошибка:', err);
    res.json({ found: false, error: String(err.message || err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер Ozon Delivery запущен на порту ${PORT}`);
});

/**
 * ==================== РАЗОВАЯ НАСТРОЙКА — СДЕЛАТЬ ОДИН РАЗ ПЕРЕД ЗАПУСКОМ ====================
 *
 * Без этого шага расчёт цены и список пунктов выдачи работать не будут —
 * сервер будет честно отвечать "метод доставки ещё не настроен".
 *
 * ШАГ 1. Найдите ваш пункт отгрузки (куда вы физически сдаёте посылки Ozon)
 *
 * Откройте в браузере (после того как сервер задеплоен):
 *   https://ваш-сервер.onrender.com/api/setup/find-dropoff?city=Москва
 *
 * (добавьте временный маршрут ниже, если хотите вызвать это через браузер,
 * либо выполните запрос напрямую через curl/Postman к самому Ozon —
 * см. пример в документации: POST /v1/dropoff-point/search с телом
 * {"filters":{"address_search":"Москва"},"pagination":{"limit":50}})
 *
 * Найдите в ответе dropoff_point_id того пункта, что ближе всего к вашему
 * реальному адресу (2-я Фрезерная улица, 14 стр. 1А, Москва).
 *
 * ШАГ 2. Так же найдите пункт для возвратов (POST /v1/return-point/search)
 *
 * ШАГ 3. Создайте метод доставки (POST /v1/shipment-method/create):
 *   {
 *     "name": "Meus Domus — dropoff",
 *     "phone_number": "+79774444141",
 *     "is_bulky": false,
 *     "type": { "dropoff": { "dropoff_point_id": <из шага 1>, "return_point_id": <из шага 2> } }
 *   }
 *
 * Ozon вернёт shipment_method_id — впишите это число в переменную
 * OZON_SHIPMENT_METHOD_ID в начале этого файла.
 *
 * Для удобства этих трёх шагов ниже есть временные служебные маршруты —
 * можно просто открыть их в браузере вместо ручных curl-запросов.
 */

app.get('/api/setup/find-dropoff', async (req, res) => {
  try {
    const search = (req.query.city || 'Москва').trim();
    // ВАЖНО: Ozon требует is_bulky и viewport как ОБЯЗАТЕЛЬНЫЕ поля фильтра,
    // хотя в примере документации они просто были частью примера, без
    // явной пометки "required" — сервер ответил ошибкой валидации без них.
    // is_bulky:false — ищем обычные (не крупногабаритные) пункты, это
    // подходит для наших товаров. viewport — географические границы
    // поиска; ниже — с запасом вся Москва и ближайшее Подмосковье.
    const result = await ozonApiCall('/v1/dropoff-point/search', {
      filters: {
        address_search: search,
        is_bulky: false,
        viewport: {
          left_bottom: { latitude: 55.49, longitude: 37.31 },
          right_top: { latitude: 55.95, longitude: 37.97 }
        }
      },
      pagination: { limit: 50 }
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get('/api/setup/find-return-point', async (req, res) => {
  try {
    const search = (req.query.city || 'Москва').trim();
    // На всякий случай сразу добавляем viewport — по методу dropoff-point
    // выяснилось, что Ozon требует его как обязательный, хотя в
    // документации это было не явно. Параметр search сюда не подставляем
    // напрямую (у этого метода в документации нет address_search в
    // фильтрах — только shipment_method_id, viewport, types), но
    // географические границы ограничивают поиск тем же районом.
    const result = await ozonApiCall('/v1/return-point/search', {
      filters: {
        viewport: {
          left_bottom: { latitude: 55.49, longitude: 37.31 },
          right_top: { latitude: 55.95, longitude: 37.97 }
        }
      },
      pagination: { limit: 50 }
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get('/api/setup/create-shipment-method', async (req, res) => {
  try {
    const dropoffId = parseInt(req.query.dropoffId, 10);
    const returnId = parseInt(req.query.returnId, 10);
    if (!dropoffId || !returnId) {
      return res.status(400).json({ error: 'Передайте dropoffId и returnId параметрами запроса' });
    }
    const result = await ozonApiCall('/v1/shipment-method/create', {
      name: 'Meus Domus — dropoff',
      phone_number: '+79774444141',
      is_bulky: false,
      type: { dropoff: { dropoff_point_id: dropoffId, return_point_id: returnId } }
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});
