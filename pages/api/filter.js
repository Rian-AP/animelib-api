/**
 * Filter Anime Endpoint
 * Расширенный поиск с фильтрацией и сортировкой
 * 
 * Query параметры:
 * - q: поисковый запрос (опционально)
 * - limit: количество результатов (10-60, default: 20)
 * - page: номер страницы (default: 1)
 * - sort: сортировка (rating, -rating, updated_at, -updated_at, name, -name)
 * - type: тип аниме (16=TV сериал, 17=Фильм, 18=OVA, 19=ONA, 21=Спешл)
 * - status: статус (1=Онгоинг, 2=Завершён, 3=Анонс)
 * - year: год выпуска
 * - age_rating: возрастное ограничение (0=Нет, 1=6+, 2=12+, 3=16+, 4=18+)
 * 
 * Примеры:
 * /api/filter?type=16&status=2&sort=-rating&limit=20
 * /api/filter?year=2023&type=16&sort=-rating
 * /api/filter?q=naruto&status=2&sort=-rating
 */

import axios from 'axios';
import { processApiResponse } from '../../lib/imageProxyHelper';

const ORIGINAL_API_BASE = 'https://api.cdnlibs.org/api';

// Допустимые варианты сортировки
const ALLOWED_SORTS = [
  'rating', '-rating',
  'updated_at', '-updated_at',
  'name', '-name',
  'created_at', '-created_at'
];

export default async function handler(req, res) {
  const { method, query } = req;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Получаем базовый URL прокси для замены image URL
    const host = req.headers.host || 'localhost:3000';
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const proxyBase = `${protocol}://${host}`;

    // Параметры запроса
    const limit = Math.min(Math.max(parseInt(query.limit) || 20, 10), 60);
    const page = parseInt(query.page) || 1;
    const sort = ALLOWED_SORTS.includes(query.sort) ? query.sort : '-rating';

    // Строим параметры для оригинального API
    const params = {
      limit,
      page,
      sort,
    };

    // Добавляем поисковый запрос
    if (query.q) params.q = query.q;

    // Добавляем фильтры
    if (query.type) params.type = query.type;
    if (query.status) params.status = query.status;
    if (query.year) params.year = query.year;
    if (query.age_rating) params.age_rating = query.age_rating;

    // Запрос к оригинальному API
    const response = await axios.get(`${ORIGINAL_API_BASE}/anime`, {
      params,
      timeout: 15000,
    });

    // Обрабатываем ответ и заменяем image URL
    const processedData = processApiResponse(response.data, proxyBase);

    res.status(200).json(processedData);
  } catch (error) {
    console.error('❌ Filter API error:', error.message);
    
    if (error.response) {
      res.status(error.response.status).json({
        error: 'Failed to filter anime',
        details: error.message
      });
    } else {
      res.status(500).json({
        error: 'Internal server error',
        details: error.message
      });
    }
  }
}
