/*********************************************************************
 * Anime API Proxy - Полный прокси для API аниме
 * URL: https://api.cdnlibs.org/api
 * 
 * Функции:
 * - Проксирует запросы к API аниме
 * - Проксирует изображения с обходом CORS
 * - Кэширование запросов (5 минут)
 * - Rate limiting (100 запросов/минуту)
 * - Обработка ошибок и fallback'ы
 * - CORS поддержка
 *********************************************************************/

import axios from 'axios';
import { processApiResponse } from '../../../lib/imageProxyHelper';

// ==================== Константы ====================

// Базовые URL для API и изображений
const ORIGINAL_API_BASE = 'https://api.cdnlibs.org/api';
const IMAGE_BASE = 'https://cover.imglib.info';

// Разрешённые HTTP методы
const ALLOWED_METHODS = new Set(['GET', 'OPTIONS']);

// Заголовки, которые нужно игнорировать при проксировании
const IGNORED_HEADERS = new Set([
  'host',
  'connection', 
  'accept-encoding',
  'content-length',
  'origin',
  'referer',
]);

// Кэш для GET запросов (простая реализация в памяти)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

// Rate limiting - защита от спама
const requestCounts = new Map();
const MAX_REQUESTS_PER_MINUTE = 100;

// ==================== Основной обработчик ====================

export default async function handler(req, res) {
  const { path } = req.query;
  const { method, query, headers } = req;
  
  // Получаем базовый URL прокси для замены image URL
  const host = req.headers.host || 'localhost:3000';
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const proxyBase = `${protocol}://${host}`;

  // 1. Проверка HTTP метода
  if (!ALLOWED_METHODS.has(method)) {
    return res.status(405).json({ 
      error: 'Method not allowed', 
      allowed: Array.from(ALLOWED_METHODS) 
    });
  }

  // 2. Устанавливаем CORS заголовки для всех ответов
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 часа

  // 3. Обрабатываем OPTIONS запросы (для CORS preflight)
  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 4. Rate limiting - проверяем количество запросов
  const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  
  if (!requestCounts.has(clientIP)) {
    requestCounts.set(clientIP, []);
  }
  
  const requests = requestCounts.get(clientIP);
  const recentRequests = requests.filter(time => now - time < 60000);
  
  if (recentRequests.length >= MAX_REQUESTS_PER_MINUTE) {
    return res.status(429).json({ 
      error: 'Too many requests',
      limit: MAX_REQUESTS_PER_MINUTE,
      window: '1 minute'
    });
  }
  recentRequests.push(now);
  requestCounts.set(clientIP, recentRequests);

  try {
    // 5. Формируем путь запроса
    const originalPath = Array.isArray(path) ? path.join('/') : path;
    
    // 6. Валидация пути - защита от SSRF атак
    if (originalPath.includes('..') || originalPath.includes('//')) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    // 7. Определяем тип запроса и формируем правильный URL
    let targetUrl;
    let isImageRequest = false;
    
    // Проверяем, является ли это запросом изображения
    if (originalPath.includes('uploads/') && 
        (originalPath.endsWith('.jpg') || 
         originalPath.endsWith('.png') || 
         originalPath.endsWith('.webp') ||
         originalPath.endsWith('.gif'))) {
      
      // Запрос к изображению
      targetUrl = `${IMAGE_BASE}/${originalPath}`;
      isImageRequest = true;
    } else {
      // Запрос к API
      targetUrl = `${ORIGINAL_API_BASE}/${originalPath}`;
    }
    
    // 8. Проверяем кэш
    const cacheKey = `${method}:${targetUrl}:${JSON.stringify(query)}`;
    const cached = cache.get(cacheKey);
    
    if (cached && (now - cached.timestamp < CACHE_TTL)) {
      if (isImageRequest) {
        // Возвращаем изображение из кэша
        res.setHeader('Content-Type', cached.contentType);
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).send(cached.data);
      } else {
        // Возвращаем API данные из кэша (с заменой image URL)
        const processedData = processApiResponse(cached.data, proxyBase);
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json(processedData);
      }
    }

    console.log(`🔄 [${clientIP}] Proxying ${method} ${targetUrl}`);

    // 9. Подготавливаем заголовки для проксирования
    const filteredHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
      if (!IGNORED_HEADERS.has(key.toLowerCase())) {
        filteredHeaders[key] = value;
      }
    }

    // Специальные заголовки для изображений (помогают обойти блокировку)
    if (isImageRequest) {
      // Имитируем реальный браузер для доступа к изображениям
      filteredHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
      filteredHeaders['Accept'] = 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';
      filteredHeaders['Accept-Language'] = 'en-US,en;q=0.9,ru;q=0.8';
      filteredHeaders['Accept-Encoding'] = 'gzip, deflate, br';
      filteredHeaders['Cache-Control'] = 'no-cache';
      filteredHeaders['Pragma'] = 'no-cache';
      filteredHeaders['Referer'] = 'https://animelib-api.vercel.app/';
      filteredHeaders['Sec-Fetch-Dest'] = 'image';
      filteredHeaders['Sec-Fetch-Mode'] = 'no-cors';
      filteredHeaders['Sec-Fetch-Site'] = 'cross-site';
    } else {
      // Заголовки для API запросов
      filteredHeaders['User-Agent'] = 'AnimeSearchProxy/1.0 (Personal Use)';
    }
    
    // 10. Выполняем запрос к оригинальному серверу
    const originalResponse = await axios({
      method: method,
      url: targetUrl,
      params: isImageRequest ? {} : query, // Изображения не используют query параметры
      headers: filteredHeaders,
      responseType: 'arraybuffer', // Получаем как бинарные данные
      timeout: 15000, // 15 секунд timeout
      validateStatus: (status) => status < 500, // Не бросать ошибки для 4xx
    });

    // 11. Обрабатываем ответ
    if (isImageRequest) {
      const contentType = originalResponse.headers['content-type'] || 'image/jpeg';
      
      // Проверяем, что сервер не вернул HTML вместо изображения
      if (contentType.includes('text/html') || contentType.includes('application/json')) {
        const text = Buffer.from(originalResponse.data).toString('utf-8');
        
        // Сервер заблокировал изображение (403 Forbidden)
        if (text.includes('<html>') || text.includes('403') || text.includes('forbidden')) {
          console.warn(`🚫 Image blocked by server: ${targetUrl}`);
          
          // Возвращаем SVG placeholder
          const placeholderSvg = `
            <svg width="300" height="200" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                  <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
                </linearGradient>
              </defs>
              <rect width="100%" height="100%" fill="url(#grad)" rx="8"/>
              <text x="50%" y="40%" font-family="Arial" font-size="24" fill="white" text-anchor="middle" dy=".3em">🎌</text>
              <text x="50%" y="60%" font-family="Arial" font-size="14" fill="white" text-anchor="middle" dy=".3em">Anime Cover</text>
            </svg>
          `;
          const placeholderBuffer = Buffer.from(placeholderSvg, 'utf-8');
          
          res.setHeader('Content-Type', 'image/svg+xml');
          res.setHeader('Content-Length', placeholderBuffer.length);
          res.setHeader('X-Cache', 'MISS');
          res.setHeader('X-Placeholder', 'true');
          return res.status(200).end(placeholderBuffer);
        }
      }
      
      // Изображение получено успешно
      const buffer = Buffer.from(originalResponse.data);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 час кэш
      res.setHeader('X-Cache', 'MISS');
      
      // Сохраняем в кэш
      cache.set(cacheKey, {
        timestamp: now,
        data: buffer,
        contentType: contentType
      });
      
      res.status(200).end(buffer);
      
    } else {
      // API запрос - парсим JSON
      const jsonData = JSON.parse(Buffer.from(originalResponse.data).toString('utf-8'));
      
      // Заменяем image URL на прокси URL
      const processedData = processApiResponse(jsonData, proxyBase);
      
      res.setHeader('X-Cache', 'MISS');
      res.status(originalResponse.status).json(processedData);
      
      // Сохраняем успешные API запросы в кэш (оригинальные данные)
      if (method === 'GET' && originalResponse.status === 200) {
        cache.set(cacheKey, {
          timestamp: now,
          data: jsonData
        });
      }
    }

  } catch (error) {
    console.error('❌ Proxy error:', error.message);

    // Обработка различных типов ошибок
    if (error.response) {
      // Ошибка от оригинального сервера
      if (error.response.status === 404) {
        return res.status(404).json({ 
          error: 'Resource not found', 
          url: targetUrl 
        });
      }
      res.status(error.response.status).json(error.response.data);
    } else if (error.code === 'ECONNABORTED') {
      // Timeout
      res.status(408).json({ error: 'Request timeout' });
    } else if (error.request) {
      // Сервер не отвечает
      res.status(502).json({ error: 'Failed to reach original API' });
    } else {
      // Внутренняя ошибка
      res.status(500).json({ 
        error: 'Internal proxy error', 
        details: error.message 
      });
    }
  } finally {
    // 12. Очистка кэша (удаляем старые записи)
    if (cache.size > 1000) {
      const cutoff = Date.now() - CACHE_TTL;
      for (const [key, value] of cache.entries()) {
        if (value.timestamp < cutoff) {
          cache.delete(key);
        }
      }
    }
  }
}

// ==================== Конфигурация Next.js API ====================

export const config = {
  api: {
    responseLimit: false, // Не ограничиваем размер ответа
    bodyParser: {
      sizeLimit: '20mb', // Увеличиваем для изображений
    },
  },
};
