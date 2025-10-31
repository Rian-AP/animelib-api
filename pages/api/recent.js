/**
 * Recent Anime Endpoint
 * Возвращает недавно обновлённые аниме
 * 
 * Query параметры:
 * - limit: количество результатов (10-60, default: 20)
 * - page: номер страницы (default: 1)
 * - type: тип аниме (16=TV сериал, 17=Фильм, 18=OVA, 19=ONA, 21=Спешл)
 * - status: статус (1=Онгоинг, 2=Завершён, 3=Анонс)
 */

import axios from 'axios';
import { processApiResponse } from '../../lib/imageProxyHelper';

const ORIGINAL_API_BASE = 'https://api.cdnlibs.org/api';

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

    // Строим параметры для оригинального API
    const params = {
      limit,
      page,
      sort: '-updated_at', // Сортировка по дате обновления (от новых к старым)
    };

    // Добавляем опциональные фильтры
    if (query.type) params.type = query.type;
    if (query.status) params.status = query.status;

    // Запрос к оригинальному API
    const response = await axios.get(`${ORIGINAL_API_BASE}/anime`, {
      params,
      timeout: 15000,
    });

    // Обрабатываем ответ и заменяем image URL
    const processedData = processApiResponse(response.data, proxyBase);

    res.status(200).json(processedData);
  } catch (error) {
    console.error('❌ Recent API error:', error.message);
    
    if (error.response) {
      res.status(error.response.status).json({
        error: 'Failed to fetch recent anime',
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
