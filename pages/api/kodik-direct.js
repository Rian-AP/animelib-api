// pages/api/kodik-direct.js
import { Client, VideoLinks } from 'kodikwrapper';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    const client = Client.fromToken(process.env.KODIK_PUBLIC_TOKEN);
    
    const links = await VideoLinks.getLinks({
      link: url,
      // Добавим браузерные заголовки
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        'Referer': 'https://kodik.info/'
      }
    });
    
    res.status(200).json({ links });
  } catch (error) {
    console.error('Kodik API error:', error);
    res.status(500).json({ 
      error: 'Failed to get video links',
      details: error.message 
    });
  }
}
