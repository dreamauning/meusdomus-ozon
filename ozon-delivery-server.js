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

const app = express();
app.use(cors());
app.use(express.json());

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

  const response = await fetch(OZON_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: OZON_CLIENT_ID,
      client_secret: OZON_CLIENT_SECRET,
      grant_type: 'client_credentials',
      scope: OZON_SCOPES
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ozon не выдал токен (статус ${response.status}): ${text}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function ozonApiCall(endpoint, body) {
  const token = await getOzonToken();
  const response = await fetch(`${OZON_API_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body || {})
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch (e) { json = null; }
  if (!response.ok) {
    const err = new Error(`Ozon API ${endpoint} ответил статусом ${response.status}: ${text}`);
    err.ozonResponse = json;
    err.status = response.status;
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
    const result = await ozonApiCall('/v1/dropoff-point/search', {
      filters: { address_search: search },
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
    const result = await ozonApiCall('/v1/return-point/search', {
      filters: {},
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
