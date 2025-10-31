// pages/api/kodik/[...path].js
import axios from 'axios';
import KodikIntegration from '../../../lib/kodikIntegration';

const kodik = new KodikIntegration();

export default async function handler(req, res) {
  const { path } = req.query;
  const { method } = req;

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
    const originalPath = Array.isArray(path) ? path.join('/') : path;
    
    if (originalPath === 'episode') {
      // Получаем прямые ссылки для эпизода
      const { episode_id } = req.query;
      
      if (!episode_id) {
        return res.status(400).json({ error: 'episode_id required' });
      }

      // Получаем данные эпизода через наш прокси или напрямую
      const host = req.headers.host || 'localhost:3000';
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const baseUrl = `${protocol}://${host}`;
      
      const episodeResponse = await axios.get(`${baseUrl}/api/proxy/episodes/${episode_id}`);
      const episodeData = episodeResponse.data;

      // Получаем прямые ссылки через kodikwrapper
      const videoLinks = await kodik.getVideoFromEpisode(episodeData);

      return res.status(200).json({
        episode_id: episode_id,
        kodik_links: videoLinks,
        total_links: videoLinks.length
      });
    }

    return res.status(404).json({ error: 'Not found' });

  } catch (error) {
    console.error('❌ Kodik API error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}