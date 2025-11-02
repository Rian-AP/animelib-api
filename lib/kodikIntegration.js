// lib/kodikUltraFast.js
import { Client, VideoLinks } from 'kodikwrapper';

const KODIK_TOKEN = process.env.KODIK_PUBLIC_TOKEN || 'q8p5vnf9crt7xfyzke4iwc6r5rvsurv7';
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101'
];

class KodikUltraFast {
  constructor() {
    this.client = Client.fromToken(KODIK_TOKEN);
    this.requestCount = 0;
    this.results = [];
  }

  getRandomUserAgent() {
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  extractKodikLink(episodePlayer) {
    try {
      if (!episodePlayer || !episodePlayer.src) return null;
      const src = episodePlayer.src;
      if (src.includes('kodik.info') || src.includes('aniqit.com')) {
        return src;
      }
      return null;
    } catch {
      return null;
    }
  }

  createIframeFallback(player) {
    try {
      const kodikLink = this.extractKodikLink(player);
      if (!kodikLink) return null;

      const match = kodikLink.match(/\/seria\/(\d+)/);
      const episodeId = match ? match[1] : null;

      if (!episodeId) return null;

      return {
        team: player.team?.name || 'Unknown',
        teamSlug: player.team?.slug,
        views: player.views || 0,
        translation: player.translation_type?.label,
        kodikLink: kodikLink.startsWith('//') ? 'https:' + kodikLink : kodikLink,
        directLinksAvailable: false,
        iframeUrl: `https://kodik.info/seria/${episodeId}`,
        embedType: 'iframe',
        fallback: true
      };
    } catch {
      return null;
    }
  }

  async getDirectVideoLinksUltraFast(kodikLink, options = {}) {
    this.requestCount++;
    
    // МИНИМАЛЬНЫЙ таймаут - 2 секунды максимум!
    const timeoutMs = options.timeout || 2000;
    
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), timeoutMs);
      });

      const requestPromise = VideoLinks.getLinks({
        link: kodikLink,
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Accept': 'application/json',
          'Accept-Language': 'ru-RU,ru;q=0.9'
        },
        ...options
      });

      return await Promise.race([requestPromise, timeoutPromise]);
    } catch {
      return null;
    }
  }

  extractVideoInfoFast(directLinks) {
    if (!directLinks) return null;

    const qualities = {};
    Object.keys(directLinks).forEach(quality => {
      const links = directLinks[quality];
      if (Array.isArray(links) && links.length > 0) {
        qualities[quality] = links.map(link => ({
          ...link,
          src: link.src.startsWith('//') ? 'https:' + link.src : link.src,
          type: link.type
        }));
      }
    });

    return qualities;
  }

  async processPlayerUltraFast(player, playerIndex) {
    const startTime = Date.now();
    const kodikLink = this.extractKodikLink(player);
    
    if (!kodikLink) {
      return this.createIframeFallback(player);
    }

    const baseInfo = {
      team: player.team?.name || 'Unknown',
      teamSlug: player.team?.slug,
      views: player.views || 0,
      translation: player.translation_type?.label,
      kodikLink: kodikLink.startsWith('//') ? 'https:' + kodikLink : kodikLink,
    };

    // БЫСТРО получаем прямые ссылки
    const directLinks = await this.getDirectVideoLinksUltraFast(kodikLink);
    const elapsed = Date.now() - startTime;
    
    const videoInfo = this.extractVideoInfoFast(directLinks);

    if (videoInfo && Object.keys(videoInfo).length > 0) {
      console.log(`✅ ${baseInfo.team} - ${elapsed}ms`);
      return {
        ...baseInfo,
        directLinks: videoInfo,
        quality: Object.keys(videoInfo).sort((a, b) => parseInt(b) - parseInt(a))[0],
        directLinksAvailable: true
      };
    } else {
      console.log(`🔄 ${baseInfo.team} - iframe fallback - ${elapsed}ms`);
      return this.createIframeFallback(player);
    }
  }

  async getAllPlayersUltraFast(episodeData) {
    console.log('🚀 ULTRA-FAST режим: Получаем все 6 плееров максимально быстро!');
    
    const episode = episodeData.data;
    if (!episode?.players) {
      throw new Error('Плееры не найдены');
    }

    // Все Kodik плееры
    const kodikPlayers = episode.players.filter(player => 
      player.player === 'Kodik' && player.src
    );

    console.log(`📋 Найдено ${kodikPlayers.length} Kodik плееров`);
    
    // ВСЕ 6 ПЛЕЕРОВ ПАРАЛЛЕЛЬНО - МАКСИМАЛЬНАЯ СКОРОСТЬ!
    const promises = kodikPlayers.map((player, index) => 
      this.processPlayerUltraFast(player, index)
    );

    // Ждём ВСЕ результаты параллельно
    const results = await Promise.all(promises);
    
    // Сортируем по популярности (views)
    return results.sort((a, b) => (b.views || 0) - (a.views || 0));
  }

  async getVideoFromEpisodeUltraFast(episodeData, options = {}) {
    const startTime = Date.now();
    
    try {
      // МАКСИМАЛЬНО БЫСТРО получаем все результаты
      const results = await this.getAllPlayersUltraFast(episodeData);
      
      const totalTime = Date.now() - startTime;
      const directCount = results.filter(r => r.directLinksAvailable).length;
      const iframeCount = results.filter(r => r.fallback).length;
      
      console.log(`🎯 ULTRA-FAST завершено!`);
      console.log(`⏱️ Общее время: ${totalTime}ms`);
      console.log(`✅ Прямые ссылки: ${directCount}/${results.length}`);
      console.log(`🔄 Iframe fallback: ${iframeCount}/${results.length}`);
      
      return {
        results,
        stats: {
          totalTime,
          totalPlayers: results.length,
          directLinks: directCount,
          iframeFallback: iframeCount,
          successRate: Math.round((directCount / results.length) * 100)
        }
      };
      
    } catch (error) {
      console.error('❌ ULTRA-FAST ошибка:', error.message);
      return { results: [], stats: { error: error.message } };
    }
  }
}

export default KodikUltraFast;
