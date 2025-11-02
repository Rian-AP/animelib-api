// lib/kodikIntegration.js
import { Client, VideoLinks } from 'kodikwrapper';

// ВАЖНО: Получите токен на https://bd.kodik.biz/api/info
const KODIK_TOKEN = process.env.KODIK_PUBLIC_TOKEN || 'q8p5vnf9crt7xfyzke4iwc6r5rvsurv7';

class KodikIntegration {
  constructor() {
    this.client = Client.fromToken(KODIK_TOKEN);
  }

  // Поиск аниме через Kodik API
  async searchAnime(title, options = {}) {
    try {
      const response = await this.client.search({
        limit: options.limit || 10,
        title: title,
        ...options
      });

      return response.results || [];
    } catch (error) {
      console.error('❌ Ошибка поиска в Kodik:', error.message);
      return [];
    }
  }

  // Извлекает ссылку из данных эпизода нашего API
  extractKodikLink(episodePlayer) {
    if (!episodePlayer || !episodePlayer.src) return null;
    
    const src = episodePlayer.src;
    
    // Проверяем что это действительно Kodik ссылка
    if (src.includes('kodik.info') || src.includes('aniqit.com')) {
      return src;
    }
    
    return null;
  }

  // Получает прямые ссылки на видео через kodikwrapper
  async getDirectVideoLinks(kodikLink, options = {}) {
    try {
      if (!kodikLink) {
        throw new Error('Ссылка на Kodik не найдена');
      }

      // Таймаут 15 секунд
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 15000)
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

  // Получает информацию о качестве видео
  extractVideoInfo(directLinks) {
    if (!directLinks) return null;

    const qualities = {};
    Object.keys(directLinks).forEach(quality => {
      const links = directLinks[quality];
      if (Array.isArray(links) && links.length > 0) {
        // Возвращаем только прямые ссылки
        qualities[quality] = links.map(link => {
          const src = link.src.startsWith('//') ? 'https:' + link.src : link.src;
          return src;
        });
      }
    });

    return Object.keys(qualities).length > 0 ? qualities : null;
  }

  // Интегрированная функция - получает видео из нашего API и конвертирует в прямые ссылки
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

      // Параллельная обработка по батчам
      const batchSize = 3;
      const results = [];
      
      for (let i = 0; i < kodikPlayers.length; i += batchSize) {
        const batch = kodikPlayers.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (player) => {
          const kodikLink = this.extractKodikLink(player);
          if (!kodikLink) return null;

          try {
            console.log(`🔍 Получаем прямые ссылки для ${player.team?.name || 'Unknown'}...`);
            
            const directLinks = await this.getDirectVideoLinks(kodikLink, options);
            const videoInfo = this.extractVideoInfo(directLinks);

            if (videoInfo) {
              console.log(`✅ Прямые ссылки получены для ${player.team?.name}`);
              
              return {
                team: player.team?.name || 'Unknown',
                teamSlug: player.team?.slug,
                views: player.views || 0,
                translation: player.translation_type?.label,
                qualities: videoInfo,
                bestQuality: Object.keys(videoInfo).sort((a, b) => parseInt(b) - parseInt(a))[0]
              };
            }
            
            return null;
          } catch (error) {
            console.warn(`⚠️ Ошибка для ${player.team?.name}:`, error.message);
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults.filter(result => result !== null));
        
        // Задержка между батчами
        if (i + batchSize < kodikPlayers.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Возвращаем только успешные результаты
      return results
        .filter(result => result !== null)
        .sort((a, b) => (b.views || 0) - (a.views || 0));

    } catch (error) {
      console.error('❌ Общая ошибка интеграции:', error.message);
      return [];
    }
  }

  // Получение прямых ссылок только для лучшего плеера
  async getBestVideoFromEpisode(episodeData, options = {}) {
    try {
      const episode = episodeData.data;
      if (!episode?.players) {
        throw new Error('Плееры не найдены');
      }

      // Сортируем по просмотрам
      const kodikPlayers = episode.players
        .filter(player => player.player === 'Kodik' && player.src)
        .sort((a, b) => (b.views || 0) - (a.views || 0));

      if (kodikPlayers.length === 0) {
        throw new Error('Kodik плееры не найдены');
      }

      // Пробуем получить прямые ссылки для топ-5 плееров
      for (const player of kodikPlayers.slice(0, 5)) {
        const kodikLink = this.extractKodikLink(player);
        if (!kodikLink) continue;

        try {
          console.log(`🔍 Пытаемся получить прямые ссылки для ${player.team?.name}...`);
          const directLinks = await this.getDirectVideoLinks(kodikLink, options);
          const videoInfo = this.extractVideoInfo(directLinks);

          if (videoInfo) {
            console.log(`✅ Успешно получены прямые ссылки для ${player.team?.name}`);
            
            return {
              team: player.team?.name || 'Unknown',
              teamSlug: player.team?.slug,
              views: player.views || 0,
              translation: player.translation_type?.label,
              qualities: videoInfo,
              bestQuality: Object.keys(videoInfo).sort((a, b) => parseInt(b) - parseInt(a))[0]
            };
          }
        } catch (error) {
          console.warn(`⚠️ Не удалось получить ссылки для ${player.team?.name}`);
        }
      }

      return null;

    } catch (error) {
      console.error('❌ Ошибка:', error.message);
      return null;
    }
  }
}

export default KodikIntegration;
