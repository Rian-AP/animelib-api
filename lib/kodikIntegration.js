// lib/kodikIntegration.js
import { Client, VideoLinks } from 'kodikwrapper';

// ВАЖНО: Получите токен на https://bd.kodik.biz/api/info
const KODIK_TOKEN = process.env.KODIK_PUBLIC_TOKEN || 'your_public_token_here';

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
    
    // Наши данные содержат относительные ссылки типа "//kodik.info/seria/..."
    const src = episodePlayer.src;
    
    // Проверяем что это действительно Kodik ссылка
    if (src.includes('kodik.info') || src.includes('aniqit.com')) {
      // Возвращаем как есть - kodikwrapper умеет обрабатывать такие ссылки
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

      // Пробуем получить прямые ссылки
      const links = await VideoLinks.getLinks({
        link: kodikLink,
        ...options
      });

      return links;
    } catch (error) {
      console.error('❌ Ошибка получения прямых ссылок:', error.message);
      
      // Fallback - пробуем с актуальным endpoint
      try {
        const parsedLink = await VideoLinks.parseLink({
          link: kodikLink, 
          extended: true
        });

        if (!parsedLink.ex?.playerSingleUrl) {
          throw new Error('Не удалось получить ссылку на плеер');
        }

        const endpoint = await VideoLinks.getActualVideoInfoEndpoint(
          parsedLink.ex.playerSingleUrl
        );

        const links = await VideoLinks.getLinks({
          link: kodikLink,
          videoInfoEndpoint: endpoint
        });

        return links;
      } catch (fallbackError) {
        console.error('❌ Fallback также не сработал:', fallbackError.message);
        return null;
      }
    }
  }

  // Получает информацию о качестве видео
  extractVideoInfo(directLinks) {
    if (!directLinks) return null;

    const qualities = {};
    Object.keys(directLinks).forEach(quality => {
      const links = directLinks[quality];
      if (Array.isArray(links) && links.length > 0) {
        // Добавляем протокол к ссылкам
        qualities[quality] = links.map(link => ({
          ...link,
          src: link.src.startsWith('//') ? 'https:' + link.src : link.src,
          type: link.type
        }));
      }
    });

    return qualities;
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

      const results = [];

      for (const player of kodikPlayers) {
        try {
          // Извлекаем Kodik ссылку
          const kodikLink = this.extractKodikLink(player);
          if (!kodikLink) continue;

          // Получаем прямые ссылки
          const directLinks = await this.getDirectVideoLinks(kodikLink, options);
          const videoInfo = this.extractVideoInfo(directLinks);

          if (videoInfo && Object.keys(videoInfo).length > 0) {
            results.push({
              team: player.team?.name || 'Unknown',
              teamSlug: player.team?.slug,
              views: player.views || 0,
              translation: player.translation_type?.label,
              kodikLink: kodikLink,
              directLinks: videoInfo,
              quality: Object.keys(videoInfo).sort((a, b) => parseInt(b) - parseInt(a))[0] // Лучшее качество
            });
          }

          // Небольшая пауза между запросами
          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (playerError) {
          console.warn(`⚠️ Ошибка для команды ${player.team?.name}:`, playerError.message);
        }
      }

      return results.sort((a, b) => (b.views || 0) - (a.views || 0));

    } catch (error) {
      console.error('❌ Общая ошибка интеграции:', error.message);
      return [];
    }
  }
}

export default KodikIntegration;