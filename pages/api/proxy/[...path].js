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
 * 
 * НОВОЕ: Автоматический fallback на YummyAnime
 * - Прозрачно для клиента (PWA не знает о YummyAnime)
 * - Возвращает данные в формате CDNLibs
 * - Срабатывает только при ошибках основного API
 *********************************************************************/

import axios from 'axios';
import { processApiResponse } from '../../../lib/imageProxyHelper';

// ==================== Константы ====================

// Основной источник - CDNLibs
const ORIGINAL_API_BASE = 'https://api.cdnlibs.org/api';
const IMAGE_BASE = 'https://cover.imglib.info';

// Резервный источник - YummyAnime (невидим для клиента)
const YUMMYANI_API_BASE = 'https://api.yani.tv';
const YUMMYANI_IMAGE_BASE = 'https://static.yani.tv';

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

// Кэш для mapping episode_id -> anime_id (для YummyAnime fallback)
const episodeToAnimeCache = new Map();
const EPISODE_CACHE_TTL = 60 * 60 * 1000; // 1 час

// Rate limiting - защита от спама
const requestCounts = new Map();
const MAX_REQUESTS_PER_MINUTE = 100;

// ==================== НОВОЕ: Трансформация данных ====================

/**
 * Конвертирует данные YummyAnime в формат CDNLibs
 * Делает fallback прозрачным для клиента
 */
function transformYummyAniToCDNLibs(yummyData, originalPath, animeId = null, episodeId = null) {
  // Если данных нет, возвращаем null
  if (!yummyData) {
    return null;
  }

  // Если это запрос деталей конкретного эпизода /episodes/{id}
  if (episodeId && originalPath.match(/episodes\/\d+/)) {
    const videosData = yummyData.response || (Array.isArray(yummyData) ? yummyData : []);
    
    // Ищем конкретный эпизод по ID
    const targetVideo = videosData.find(v => (v.video_id || v.id) == episodeId);
    
    if (!targetVideo) {
      return null;
    }
    
    // Собираем все Kodik плееры для этого эпизода
    const players = videosData
      .filter(v => {
        const episodeNum = v.number || v.episode || v.num;
        const targetNum = targetVideo.number || targetVideo.episode || targetVideo.num;
        const playerType = v.data?.player || v.player || 'Kodik';
        return episodeNum == targetNum && playerType.toLowerCase().includes('kodik');
      })
      .map(v => {
        let iframeUrl = v.iframe_url || v.link;
        if (iframeUrl && iframeUrl.startsWith('//')) {
          iframeUrl = 'https:' + iframeUrl;
        }
        
        const dubbing = v.data?.dubbing || v.dubbing || 'Original';
        const translationType = v.data?.translation_type || (dubbing.includes('Субтитры') ? 'Субтитры' : 'Озвучка');
        
        return {
          id: v.video_id || v.id || 0,
          episode_id: episodeId,
          player: "Kodik",
          translation_type: {
            id: translationType === 'Субтитры' ? 1 : 2,
            label: translationType
          },
          team: {
            id: 0,
            slug: dubbing.toLowerCase().replace(/\s+/g, ''),
            slug_url: `0--${dubbing.toLowerCase().replace(/\s+/g, '')}`,
            model: "team",
            name: dubbing,
            cover: null,
            stats: []
          },
          created_at: v.date ? new Date(v.date * 1000).toISOString() : new Date().toISOString(),
          views: 0,
          src: iframeUrl,
          timecode: []
        };
      });
    
    const episodeNum = targetVideo.number || targetVideo.episode || targetVideo.num;
    
    return {
      data: {
        id: episodeId,
        model: "episodes",
        name: "",
        number: episodeNum.toString(),
        number_secondary: "1",
        season: "1",
        status: {
          id: "default",
          label: "Полноценный эпизод",
          abbr: null
        },
        anime_id: animeId || 0,
        created_at: targetVideo.date ? new Date(targetVideo.date * 1000).toISOString() : new Date().toISOString(),
        item_number: parseInt(episodeNum),
        type: "episodes",
        players: players
      }
    };
  }

  // Если это запрос списка эпизодов /episodes?anime_id=X
  if (originalPath.includes('episodes')) {
    const videosData = yummyData.response || (Array.isArray(yummyData) ? yummyData : []);
    
    // Группируем по номеру эпизода и собираем плееры
    const episodesMap = new Map();
    
    videosData.forEach(video => {
      const playerType = video.data?.player || video.player || 'Kodik';
      if (!playerType.toLowerCase().includes('kodik')) return;

      const episodeNum = video.number || video.episode || video.num;
      if (!episodeNum) return;

      const episodeKey = `ep-${episodeNum}`;
      const videoId = video.video_id || video.id || 0;
      
      if (!episodesMap.has(episodeKey)) {
        episodesMap.set(episodeKey, {
          id: videoId, // Первый video_id становится ID эпизода
          model: "episodes",
          name: "",
          number: episodeNum.toString(),
          number_secondary: "1",
          season: "1",
          status: {
            id: "default",
            label: "Полноценный эпизод",
            abbr: null
          },
          anime_id: animeId || 0,
          created_at: video.date ? new Date(video.date * 1000).toISOString() : new Date().toISOString(),
          item_number: parseInt(episodeNum),
          type: "episodes"
        });
        
        // Сохраняем mapping episode_id -> anime_id в кеш для будущих запросов деталей
        if (animeId && videoId) {
          episodeToAnimeCache.set(videoId.toString(), {
            animeId: animeId.toString(),
            timestamp: Date.now()
          });
        }
      }
    });

    const episodes = Array.from(episodesMap.values())
      .sort((a, b) => a.item_number - b.item_number);

    return {
      data: episodes
    };
  }

  // Normalize data source
  const listData = Array.isArray(yummyData.data) ? yummyData.data : 
                   (Array.isArray(yummyData.response) ? yummyData.response : null);

  // Если это список аниме (популярные, поиск и т.д.)
  if (listData) {
    return {
      data: listData.map(item => {
        // Форматирование рейтинга
        const ratingAvg = item.rating?.average || 0;
        const votes = item.rating?.counters || 0;
        
        // Форматирование обложки (добавляем https если нет)
        const processCover = (url) => {
          if (!url) return null;
          if (url.startsWith('//')) return `https:${url}`;
          if (url.startsWith('http')) return url;
          return `https://${url}`;
        };

        const coverDefault = processCover(item.cover?.default || item.poster?.default || item.poster?.medium);
        const coverThumb = processCover(item.cover?.thumbnail || item.poster?.thumbnail || item.poster?.small);
        const coverMd = processCover(item.cover?.md || item.poster?.md || item.poster?.medium);

        return {
          id: item.id || item.anime_id,
          name: item.name || item.title,
          rus_name: item.rus_name || item.title,
          eng_name: item.eng_name || item.title,
          model: 'anime',
          slug: item.slug || item.anime_url,
          slug_url: item.slug_url || `${item.id || item.anime_id}--${item.slug || item.anime_url}`,
          cover: {
            default: coverDefault,
            thumbnail: coverThumb,
            md: coverMd,
            filename: coverDefault ? coverDefault.split('/').pop() : 'cover.jpg'
          },
          ageRestriction: item.min_age ? {
            id: item.min_age.value,
            label: item.min_age.title
          } : { id: 0, label: "12+" },
          site: item.site || 5,
          type: item.type ? {
            id: item.type.value, // Можно добавить маппинг ID если нужно
            label: item.type.name
          } : { id: 0, label: "TV Сериал" },
          rating: {
            average: ratingAvg.toFixed(2),
            averageFormated: ratingAvg.toFixed(1),
            votes: votes,
            votesFormated: votes > 1000 ? `${(votes/1000).toFixed(1)} K` : `${votes}`,
            user: 0
          },
          is_licensed: false,
          content_marking: [],
          status: item.anime_status ? {
            id: item.anime_status.value,
            label: item.anime_status.title
          } : { id: 1, label: "Выходит" },
          year: item.year,
          genres: item.genres || [],
          releaseDateString: item.releaseDateString || `${item.year} г.`,
          shiki_rate: item.rating?.shikimori_rating || 0
        };
      })
    };
  }

  // Если это конкретное аниме
  if (yummyData.anime || (yummyData.response && !Array.isArray(yummyData.response))) {
    const anime = yummyData.anime || yummyData.response;
    
    // Форматирование обложки
    const processCover = (url) => {
      if (!url) return null;
      if (url.startsWith('//')) return `https:${url}`;
      if (url.startsWith('http')) return url;
      return `https://${url}`;
    };

    const coverDefault = processCover(anime.cover?.default || anime.poster?.default || anime.poster?.medium);
    const coverThumb = processCover(anime.cover?.thumbnail || anime.poster?.thumbnail || anime.poster?.small);
    const coverMd = processCover(anime.cover?.md || anime.poster?.md || anime.poster?.medium);

    // Рейтинг
    const ratingAvg = anime.rating?.average || 0;
    const votes = anime.rating?.counters || 0;

    return {
      data: {
          id: anime.id || anime.anime_id,
          name: anime.name || anime.title,
          rus_name: anime.rus_name || anime.title,
          eng_name: anime.eng_name || anime.title,
          model: 'anime',
          slug: anime.slug || anime.anime_url,
          slug_url: anime.slug_url || `${anime.id || anime.anime_id}--${anime.slug || anime.anime_url}`,
          cover: {
            default: coverDefault,
            thumbnail: coverThumb,
            md: coverMd,
            filename: coverDefault ? coverDefault.split('/').pop() : 'cover.jpg'
          },
          background: anime.background,
          description: anime.description,
          type: anime.type ? {
            id: anime.type.value,
            label: anime.type.name,
            full_string: anime.type.name
          } : { id: 0, label: "TV Сериал", full_string: "TV Сериал" },
          status: anime.anime_status ? {
            id: anime.anime_status.value,
            label: anime.anime_status.title
          } : { id: 1, label: "Выходит" },
          rating: {
            average: ratingAvg.toFixed(2),
            averageFormated: ratingAvg.toFixed(1),
            votes: votes,
            votesFormated: votes > 1000 ? `${(votes/1000).toFixed(1)} K` : `${votes}`,
            user: 0
          },
          ageRestriction: anime.min_age ? {
            id: anime.min_age.value,
            label: anime.min_age.title
          } : { id: 0, label: "12+" },
          year: anime.year,
          season: anime.season,
          genres: anime.genres || [],
          studios: anime.studios || [],
          episodes: anime.episodes || [],
          site: anime.site || 5,
          metadata: anime.metadata || {},
          releaseDateString: anime.releaseDateString || `${anime.year} г.`,
          is_licensed: false,
          content_marking: []
      }
    };
  }

  // Если это расписание
  if (yummyData.schedule || Array.isArray(yummyData)) {
    const schedule = yummyData.schedule || yummyData;
    return {
      data: {
        schedule: Array.isArray(schedule) ? schedule.map(day => ({
          day: day.day,
          items: day.items?.map(item => ({
            id: item.id,
            name: item.name,
            rus_name: item.rus_name,
            slug: item.slug,
            cover: item.cover || item.poster,
            next_episode: item.next_episode
          })) || []
        })) : []
      }
    };
  }

  // Общий случай - оборачиваем в структуру CDNLibs
  return {
    data: yummyData.data || yummyData
  };
}

/**
 * Пытается получить данные из YummyAnime и конвертирует в формат CDNLibs
 */
async function tryYummyAniFallback(originalPath, query) {
  try {
    // Определяем путь для YummyAnime на основе оригинального запроса
    let yummyPath = originalPath;
    let yummyParams = { ...query };
    let animeId = null;
    let episodeId = null;

    // Базовая конвертация путей
    // CDNLibs: / или /popular -> YummyAnime: /anime/popular
    if (!originalPath || originalPath === '' || originalPath === 'popular') {
      yummyPath = 'catalog';
      yummyParams = { 
        sort: 'popular',
        page: yummyParams.page || 1 
      };
    }
    // CDNLibs: /search?query=X -> YummyAnime: /anime/search?q=X
    else if (originalPath.includes('search') || yummyParams.query || yummyParams.q) {
      yummyPath = 'search';
      yummyParams = {
        q: yummyParams.query || yummyParams.q,
        page: yummyParams.page || 1
      };
    }
    // CDNLibs: /reviews -> YummyAnime: /reviews
    else if (originalPath.includes('reviews')) {
      yummyPath = 'reviews';
    }
    // CDNLibs: /news -> YummyAnime: /posts
    else if (originalPath.includes('news')) {
      yummyPath = 'posts';
    }
    // CDNLibs: /anime/{id} -> YummyAnime: /anime/{id}
    else if (originalPath.match(/\/anime\/\d+/) || originalPath.match(/^\d+/)) {
      const id = originalPath.match(/\d+/)?.[0];
      yummyPath = `anime/${id}`;
      yummyParams = {};
    }
    // CDNLibs: /episodes?anime_id=X -> YummyAnime: /anime/X/videos
    else if (originalPath.includes('episodes')) {
      // Проверка на запрос конкретного эпизода /episodes/{id}
      const episodeMatch = originalPath.match(/episodes\/(\d+)/);
      if (episodeMatch) {
        episodeId = episodeMatch[1];
        
        // Для деталей эпизода нужен anime_id
        // Сначала проверяем query параметры
        if (query.anime_id) {
          animeId = query.anime_id;
        } else {
          // Если нет в query, ищем в кеше
          const cached = episodeToAnimeCache.get(episodeId);
          if (cached && (Date.now() - cached.timestamp < EPISODE_CACHE_TTL)) {
            animeId = cached.animeId;
            console.log(`📦 Found anime_id ${animeId} for episode ${episodeId} in cache`);
          }
        }
        
        if (animeId) {
          yummyPath = `anime/${animeId}/videos`;
          yummyParams = {};
        } else {
          // Не можем получить детали без anime_id
          throw new Error("Cannot fetch episode details without anime_id");
        }
      } 
      // Иначе это список эпизодов ?anime_id=X
      else {
        animeId = yummyParams.anime_id;
        if (animeId) {
          yummyPath = `anime/${animeId}/videos`;
          yummyParams = {};
        }
      }
    }

    const targetUrl = `${YUMMYANI_API_BASE}/${yummyPath}`;
    
    console.log(`🔄 Trying YummyAnime fallback: ${targetUrl}`);

    const response = await axios({
      method: 'GET',
      url: targetUrl,
      params: yummyParams,
      headers: {
        'User-Agent': 'AnimeSearchProxy/2.0',
        'Accept': 'application/json'
      },
      timeout: 10000,
      validateStatus: (status) => status < 500,
    });

    if (response.status === 200 && response.data) {
      // Конвертируем данные YummyAnime в формат CDNLibs
      const transformed = transformYummyAniToCDNLibs(response.data, originalPath, animeId, episodeId);
      
      if (transformed) {
        console.log(`✅ YummyAnime fallback successful - data transformed to CDNLibs format`);
        return {
          success: true,
          data: transformed,
          usedFallback: true
        };
      }
    }

    return null;
  } catch (error) {
    console.log(`⚠️ YummyAnime fallback failed: ${error.message}`);
    return null;
  }
}

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
    const originalPath = Array.isArray(path) ? path.join('/') : (path || '');
    
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
      filteredHeaders['User-Agent'] = 'AnimeSearchProxy/2.0 (Multi-Source Support)';
    }
    
    // 10. Выполняем запрос к оригинальному серверу
    let originalResponse;
    let fallbackUsed = false;

    try {
      originalResponse = await axios({
        method: method,
        url: targetUrl,
        params: isImageRequest ? {} : query, // Изображения не используют query параметры
        headers: filteredHeaders,
        responseType: 'arraybuffer', // Получаем как бинарные данные
        timeout: 15000, // 15 секунд timeout
        validateStatus: (status) => status < 500, // Не бросать ошибки для 4xx
      });

      // НОВОЕ: Если CDNLibs вернул ошибку ИЛИ пустой список, пробуем YummyAnime
      const isSearchRequest = originalPath.includes('search') || query.q || query.query;
      const isEpisodesRequest = originalPath.includes('episodes');
      
      let originalData = null;
      try {
        if (originalResponse.data) {
            const rawData = Buffer.from(originalResponse.data).toString('utf-8');
            // Проверяем, что это похоже на JSON, прежде чем парсить
            if (rawData.trim().startsWith('{') || rawData.trim().startsWith('[')) {
                originalData = JSON.parse(rawData);
            }
        }
      } catch (e) {
        // Игнорируем ошибки парсинга, считаем что данных нет
        console.warn('Failed to parse original response as JSON');
      }
      
      // Проверка на пустые данные для поиска и эпизодов
      const isEmptyData = originalData && originalData.data && Array.isArray(originalData.data) && originalData.data.length === 0 && (isSearchRequest || isEpisodesRequest);

      // Если не удалось распарсить JSON (например вернулся HTML), считаем это ошибкой и пробуем fallback
      const isInvalidResponse = !originalData && originalResponse.status === 200 && !isImageRequest;

      if (!isImageRequest && (originalResponse.status !== 200 || !originalResponse.data || isEmptyData || isInvalidResponse)) {
        console.log(`⚠️ CDNLibs returned ${isEmptyData ? 'empty list' : originalResponse.status}, trying YummyAnime fallback...`);
        
        const fallback = await tryYummyAniFallback(originalPath, query);
        
        if (fallback && fallback.success) {
          // Успешно получили данные из YummyAnime
          fallbackUsed = true;
          
          // Подменяем ответ (клиент получит данные в формате CDNLibs)
          originalResponse = {
            status: 200,
            data: Buffer.from(JSON.stringify(fallback.data)),
            headers: { 'content-type': 'application/json' }
          };
        } else if (isInvalidResponse || originalResponse.status !== 200) {
          // Если fallback не сработал и ответ невалидный, выбрасываем ошибку
          const isEpisodeDetail = originalPath.match(/episodes\/(\d+)/);
          if (isEpisodeDetail) {
            const episodeId = isEpisodeDetail[1];
            return res.status(404).json({ 
              error: 'Episode not found',
              message: `Episode ${episodeId} is not available in the primary source. To enable fallback access, first request the episodes list: /episodes?anime_id=YOUR_ANIME_ID`
            });
          }
          throw new Error('CDNLibs returned invalid response and YummyAnime fallback failed');
        }
      }

    } catch (primaryError) {
      console.error(`❌ CDNLibs error: ${primaryError.message}`);
      
      // НОВОЕ: Если CDNLibs полностью недоступен, пробуем YummyAnime
      if (!isImageRequest) {
        console.log(`🔄 CDNLibs unavailable, trying YummyAnime fallback...`);
        
        const fallback = await tryYummyAniFallback(originalPath, query);
        
        if (fallback && fallback.success) {
          // Успешно получили данные из YummyAnime
          fallbackUsed = true;
          
          originalResponse = {
            status: 200,
            data: Buffer.from(JSON.stringify(fallback.data)),
            headers: { 'content-type': 'application/json' }
          };
        } else {
          // Если даже fallback не сработал, бросаем оригинальную ошибку
          throw primaryError;
        }
      } else {
        throw primaryError;
      }
    }

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
      const rawData = Buffer.from(originalResponse.data).toString('utf-8');
      
      // Проверяем что это действительно JSON перед парсингом
      if (!rawData.trim().startsWith('{') && !rawData.trim().startsWith('[')) {
        throw new Error('Response is not valid JSON');
      }
      
      const jsonData = JSON.parse(rawData);
      
      // Заменяем image URL на прокси URL
      const processedData = processApiResponse(jsonData, proxyBase);
      
      res.setHeader('X-Cache', 'MISS');
      
      // НОВОЕ: Добавляем заголовок, если использован fallback (для отладки)
      if (fallbackUsed) {
        res.setHeader('X-Fallback-Used', 'yummyani');
        console.log(`✅ Response sent with YummyAnime fallback data (transparent to client)`);
      }
      
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
    
    // Очистка кэша эпизодов
    if (episodeToAnimeCache.size > 5000) {
      const episodeCutoff = Date.now() - EPISODE_CACHE_TTL;
      for (const [key, value] of episodeToAnimeCache.entries()) {
        if (value.timestamp < episodeCutoff) {
          episodeToAnimeCache.delete(key);
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
