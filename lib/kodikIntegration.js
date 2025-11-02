// lib/kodikIntegration.js - ТОЛЬКО ПРЯМЫЕ ССЫЛКИ!
import { Client, VideoLinks } from 'kodikwrapper';

const KODIK_TOKEN = process.env.KODIK_PUBLIC_TOKEN || 'q8p5vnf9crt7xfyzke4iwc6r5rvsurv7';
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
];

class KodikIntegration {
  constructor() {
    this.client = Client.fromToken(KODIK_TOKEN);
    this.cache = new Map();
  }

  // ТОЛЬКО ПРЯМЫЕ ССЫЛКИ!
  async getVideoFromEpisode(episodeData) {
    const startTime = Date.now();
    
    const episode = episodeData?.data;
    if (!episode?.players) return [];
    
    // Находим все Kodik плееры
    const kodikPlayers = episode.players.filter(p => p.player === 'Kodik' && p.src);
    if (kodikPlayers.length === 0) return [];
    
    // Кэш проверка
    const episodeId = episode.episode_id;
    if (episodeId) {
      const cached = this.cache.get(`episode_${episodeId}`);
      if (cached && Date.now() - cached < 120000) {
        console.log(`⚡ CACHE HIT: ${episodeId}`);
        return this.cache.get(`data_${episodeId}`) || [];
      }
    }
    
    // АБСОЛЮТНО ПАРАЛЛЕЛЬНО - без задержек!
    const promises = kodikPlayers.map(player => this.getDirectLinks(player));
    const results = await Promise.allSettled(promises);
    
    // ФИЛЬТРУЕМ ТОЛЬКО УСПЕШНЫЕ С ПРЯМЫМИ ССЫЛКАМИ!
    const directOnly = results
      .map(result => result.status === 'fulfilled' ? result.value : null)
      .filter(player => player !== null) // Убираем null
      .sort((a, b) => (b.views || 0) - (a.views || 0));
    
    // Кэшируем результат
    if (episodeId && directOnly.length > 0) {
      this.cache.set(`episode_${episodeId}`, Date.now());
      this.cache.set(`data_${episodeId}`, directOnly);
    }
    
    const totalTime = Date.now() - startTime;
    console.log(`🎯 DIRECT ONLY: ${directOnly.length}/${kodikPlayers.length} плееров с прямыми ссылками за ${totalTime}ms`);
    
    return directOnly; // ТОЛЬКО ПРЯМЫЕ ССЫЛКИ!
  }

  // ТОЛЬКО ПРЯМЫЕ ССЫЛКИ - никаких fallback!
  async getDirectLinks(player) {
    const src = player.src;
    if (!src?.includes('kodik')) return null;
    
    const baseInfo = {
      team: player.team?.name || 'Unknown',
      views: player.views || 0,
      translation: player.translation_type?.label
    };
    
    try {
      // БЕЗ таймаутов - сразу получаем ссылки
      const links = await VideoLinks.getLinks({
        link: src,
        headers: {
          'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
          'Accept': 'application/json'
        }
      });
      
      // ЕСЛИ ЕСТЬ ПРЯМЫЕ ССЫЛКИ - возвращаем
      if (links && Object.keys(links).length > 0) {
        const qualities = {};
        Object.keys(links).forEach(quality => {
          const linkArray = links[quality];
          if (Array.isArray(linkArray) && linkArray.length > 0) {
            qualities[quality] = linkArray.map(link => ({
              ...link,
              src: link.src.startsWith('//') ? 'https:' + link.src : link.src
            }));
          }
        });
        
        return {
          ...baseInfo,
          kodikLink: src.startsWith('//') ? 'https:' + src : src,
          directLinks: qualities,
          quality: Object.keys(qualities).sort((a, b) => parseInt(b) - parseInt(a))[0],
          directLinksAvailable: true
        };
      }
    } catch {
      // При ошибке - НИЧЕГО не возвращаем!
    }
    
    // НЕТ ПРЯМЫХ ССЫЛОК - возвращаем NULL (не попадёт в результат)
    return null;
  }
}

export default KodikIntegration;
