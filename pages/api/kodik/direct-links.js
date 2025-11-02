// pages/api/kodik/direct-links.js
// Альтернативный endpoint для получения прямых ссылок
// Использует прямой парсинг HTML страницы Kodik вместо API

import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { kodik_link } = req.query;

    if (!kodik_link) {
      return res.status(400).json({ 
        error: 'kodik_link parameter required',
        example: '/api/kodik/direct-links?kodik_link=https://kodik.info/seria/...'
      });
    }

    console.log('🔍 Попытка получить прямые ссылки для:', kodik_link);

    // Попытка получить страницу с видео
    const response = await axios.get(kodik_link, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://animego.org/',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 8000,
      maxRedirects: 5
    });

    const html = response.data;
    console.log('📄 HTML получен, длина:', html.length);

    // Пытаемся найти urlParams или videoInfo в HTML
    const videoInfoMatch = html.match(/urlParams\s*=\s*"([^"]+)"/);
    const videoLinkMatch = html.match(/https:\/\/[^"']+\.mp4[^"']*/g);
    
    if (videoInfoMatch) {
      console.log('✅ Найден urlParams:', videoInfoMatch[1]);
      return res.status(200).json({
        success: true,
        method: 'urlParams',
        urlParams: videoInfoMatch[1],
        note: 'Use this to construct video URLs manually'
      });
    }

    if (videoLinkMatch && videoLinkMatch.length > 0) {
      console.log('✅ Найдены прямые ссылки:', videoLinkMatch.length);
      return res.status(200).json({
        success: true,
        method: 'direct',
        links: videoLinkMatch
      });
    }

    // Не удалось распарсить
    console.warn('⚠️ Не удалось найти видео ссылки в HTML');
    return res.status(200).json({
      success: false,
      reason: 'Could not parse video links from HTML',
      html_sample: html.substring(0, 500),
      note: 'Kodik may be blocking Vercel IPs'
    });

  } catch (error) {
    console.error('❌ Ошибка получения прямых ссылок:', error.message);
    
    if (error.response) {
      console.error('📊 Статус ответа:', error.response.status);
      console.error('📄 Тип контента:', error.response.headers['content-type']);
    }

    return res.status(500).json({
      error: 'Failed to fetch direct links',
      message: error.message,
      details: error.response ? {
        status: error.response.status,
        contentType: error.response.headers['content-type']
      } : null,
      note: 'Kodik may be blocking requests from Vercel IPs. Consider using a proxy service or VPN.'
    });
  }
}
