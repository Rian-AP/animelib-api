// lib/kodikIntegration.js - ULTRA-SUPER-FAST
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

  getRandomUserAgent() {
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  extractKodikLink(episodePlayer) {
    if (!episodePlayer?.src) return null;
    const src = episodePlayer.src;
    return (src.includes('kodik.info') || src.includes('aniqit.com')) ? src : null;
  }

  // САМАЯ БЫСТРАЯ версия - без таймаутов, параллельно ВСЁ!
  async getVideoFromEpisodeMAX(episodeData) {
    const startTime = Date.now();
    
    const episode = episodeData?.data;
    if (!episode?.players) return [];
    
    // Находим все Kodik плееры
    const kodikPlayers = episode.players.filter(p => p.player === 'Kodik' && p.src);
    if (kodikPlayers.length === 0) return [];
    
    // АБСОЛЮТНО ПАРАЛЛЕЛЬНО - без задержек!
    const promises = kodikPlayers.map(player => this.getFastLink(player));
    const results = await Promise.allSettled(promises);
    
    // Фильтруем успешные и сортируем
    const successful = results
      .map((result, index) => result.status === 'fulfilled' ? result.value : null)
      .filter(player => player !== null)
      .sort((a, b) => (b.views || 0) - (a.views || 0));
    
    const totalTime = Date.now() - startTime;
    console.log(`⚡ MAX-SPEED: ${successful.length}/${kodikPlayers.length} плееров за ${totalTime}ms`);
    
    return successful;
  }

  // Метод без таймаутов - максимально быстро!
  async getFastLink(player) {
    const kodikLink = this.extractKodikLink(player);
    if (!kodikLink) return null;
    
    const baseInfo = {
      team: player.team?.name || 'Unknown',
      views: player.views || 0,
      translation: player.translation_type?.label,
      kodikLink: kodikLink.startsWith('//') ? 'https:' + kodikLink : kodikLink,
    };
    
    try {
      // БЕЗ таймаутов - сразу получаем
      const links = await VideoLinks.getLinks({
        link: kodikLink,
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Accept': 'application/json'
        }
      });
      
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
          directLinks: qualities,
          quality: Object.keys(qualities).sort((a, b) => parseInt(b) - parseInt(a))[0],
          directLinksAvailable: true
        };
      }
    } catch (error) {
      // Тишина при ошибке - не логируем
    }
    
    return null;
  }

  // Кэшированная версия - ещё быстрее!
  async getVideoFromEpisodeCACHE(episodeData) {
    const episodeId = episodeData?.data?.episode_id;
    if (!episodeId) return await this.getVideoFromEpisodeMAX(episodeData);
    
    const cacheKey = `episode_${episodeId}`;
    const cached = this.cache.get(cacheKey);
    
    // Если есть в кэше и он свежий (2 минуты)
    if (cached && Date.now() - cached.timestamp < 120000) {
      console.log(`⚡ CACHE HIT для эпизода ${episodeId}`);
      return cached.data;
    }
    
    // Получаем и кэшируем
    const result = await this.getVideoFromEpisodeMAX(episodeData);
    this.cache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
    
    return result;
  }

  // Гибридная версия - умная оптимизация
  async getVideoFromEpisodeSMART(episodeData) {
    const episode = episodeData?.data;
    const allPlayers = episode?.players || [];
    const kodikPlayers = allPlayers.filter(p => p.player === 'Kodik' && p.src);
    
    // Если мало плееров - максимальная скорость
    if (kodikPlayers.length <= 4) {
      return await this.getVideoFromEpisodeMAX(episodeData);
    }
    
    // Если много - кэшированная версия
    return await this.getVideoFromEpisodeCACHE(episodeData);
  }
}

export default KodikIntegration;
