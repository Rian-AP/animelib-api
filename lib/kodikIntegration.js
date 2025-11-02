// lib/kodikIntegration.js - РАБОЧАЯ ВЕРСИЯ (откат к старой)
import { Client, VideoLinks } from 'kodikwrapper';

const KODIK_TOKEN = process.env.KODIK_PUBLIC_TOKEN || 'q8p5vnf9crt7xfyzke4iwc6r5rvsurv7';

class KodikIntegration {
  constructor() {
    this.client = Client.fromToken(KODIK_TOKEN);
  }

  async getVideoFromEpisode(episodeData, options = {}) {
    try {
      const episode = episodeData.data;
      if (!episode?.players) {
        throw new Error('Плееры не найдены');
      }

      // Ищем Kodik плееры
      const kodikPlayers = episode.players.filter(player => 
        player.player === 'Kodik' && player.src
      );

      if (kodikPlayers.length === 0) {
        throw new Error('Kodik плееры не найдены');
      }

      // Параллельная обработка всех плееров
      const promises = kodikPlayers.map(async (player) => {
        const kodikLink = this.extractKodikLink(player);
        if (!kodikLink) return null;

        const baseInfo = {
          team: player.team?.name || 'Unknown',
          teamSlug: player.team?.slug,
          views: player.views || 0,
          translation: player.translation_type?.label,
          kodikLink: kodikLink.startsWith('//') ? 'https:' + kodikLink : kodikLink,
        };

        try {
          console.log(`🔍 Пытаемся получить прямые ссылки для ${baseInfo.team}...`);
          const startTime = Date.now();
          
          // Пытаемся получить прямые ссылки
          const directLinks = await this.getDirectVideoLinks(kodikLink);
          const elapsed = Date.now() - startTime;
          
          console.log(`⏱️ Запрос занял ${elapsed}ms для ${baseInfo.team}`);
          
          const videoInfo = this.extractVideoInfo(directLinks);

          if (videoInfo && Object.keys(videoInfo).length > 0) {
            console.log(`✅ Прямые ссылки получены для ${baseInfo.team}`);
            return {
              ...baseInfo,
              directLinks: videoInfo,
              quality: Object.keys(videoInfo).sort((a, b) => parseInt(b) - parseInt(a))[0],
              directLinksAvailable: true
            };
          } else {
            console.log(`❌ Прямые ссылки недоступны для ${baseInfo.team}`);
            return null;
          }
        } catch (playerError) {
          console.warn(`⚠️ Ошибка для ${baseInfo.team}:`, playerError.message);
          return null;
        }
      });

      // Ждём завершения всех запросов параллельно
      const results = (await Promise.all(promises))
        .filter(result => result !== null)
        .sort((a, b) => (b.views || 0) - (a.views || 0));

      console.log(`🎯 Найдено ${results.length} плееров с прямыми ссылками из ${kodikPlayers.length}`);
      return results;

    } catch (error) {
      console.error('❌ Общая ошибка интеграции:', error.message);
      return [];
    }
  }

  extractKodikLink(episodePlayer) {
    if (!episodePlayer || !episodePlayer.src) return null;
    
    const src = episodePlayer.src;
    if (src.includes('kodik.info') || src.includes('aniqit.com')) {
      return src;
    }
    
    return null;
  }

  async getDirectVideoLinks(kodikLink, options = {}) {
    try {
      if (!kodikLink) {
        throw new Error('Ссылка на Kodik не найдена');
      }

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout: Kodik request took too long')), 8000)
      );

      const links = await Promise.race([
        VideoLinks.getLinks({
          link: kodikLink,
          ...options
        }),
        timeoutPromise
      ]);

      return links;
    } catch (error) {
      console.error('❌ Ошибка получения прямых ссылок:', error.message);
      return null;
    }
  }

  extractVideoInfo(directLinks) {
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
}

export default KodikIntegration;
