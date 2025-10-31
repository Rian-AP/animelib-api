/**
 * Image Proxy Helper
 * Автоматически заменяет прямые ссылки на изображения на прокси-ссылки
 */

const IMAGE_DOMAINS = [
  'https://cover.imglib.info',
  'http://cover.imglib.info',
  'cover.imglib.info'
];

/**
 * Заменяет домен изображения на прокси URL
 * @param {string} imageUrl - Оригинальная ссылка на изображение
 * @param {string} proxyBase - Базовый URL прокси (например, https://animelib-api.vercel.app)
 * @returns {string} - Прокси URL
 */
function replaceImageDomain(imageUrl, proxyBase) {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return imageUrl;
  }

  // Пропускаем placeholder'ы и уже проксированные URL
  if (imageUrl.includes('placeholders/') || imageUrl.includes('/api/proxy/')) {
    return imageUrl;
  }

  // Заменяем известные домены на прокси
  for (const domain of IMAGE_DOMAINS) {
    if (imageUrl.includes(domain)) {
      // Извлекаем путь после домена
      const path = imageUrl.split(domain)[1] || imageUrl.split(domain.replace('https://', '').replace('http://', ''))[1];
      
      if (path) {
        // Убираем начальный слеш если есть
        const cleanPath = path.startsWith('/') ? path.slice(1) : path;
        return `${proxyBase}/api/proxy/${cleanPath}`;
      }
    }
  }

  return imageUrl;
}

/**
 * Рекурсивно обрабатывает объект и заменяет все image URL на прокси
 * @param {any} obj - Объект для обработки
 * @param {string} proxyBase - Базовый URL прокси
 * @returns {any} - Обработанный объект
 */
function replaceImageUrls(obj, proxyBase) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  // Обрабатываем массивы
  if (Array.isArray(obj)) {
    return obj.map(item => replaceImageUrls(item, proxyBase));
  }

  // Обрабатываем объекты
  const result = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Если это объект cover - обрабатываем его поля
    if (key === 'cover' && typeof value === 'object' && value !== null) {
      result[key] = {};
      
      for (const [coverKey, coverValue] of Object.entries(value)) {
        if (typeof coverValue === 'string') {
          result[key][coverKey] = replaceImageDomain(coverValue, proxyBase);
        } else {
          result[key][coverKey] = replaceImageUrls(coverValue, proxyBase);
        }
      }
    }
    // Если это строка с URL изображения
    else if (typeof value === 'string' && (
      value.includes('cover.imglib.info') ||
      value.includes('uploads/')
    )) {
      result[key] = replaceImageDomain(value, proxyBase);
    }
    // Рекурсивно обрабатываем вложенные объекты и массивы
    else if (typeof value === 'object' && value !== null) {
      result[key] = replaceImageUrls(value, proxyBase);
    }
    // Копируем примитивные значения как есть
    else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Главная функция для обработки API ответа
 * @param {object} data - Данные из API
 * @param {string} proxyBase - Базовый URL прокси
 * @returns {object} - Обработанные данные с прокси URL
 */
function processApiResponse(data, proxyBase) {
  if (!data) {
    return data;
  }

  return replaceImageUrls(data, proxyBase);
}

module.exports = {
  replaceImageDomain,
  replaceImageUrls,
  processApiResponse
};
