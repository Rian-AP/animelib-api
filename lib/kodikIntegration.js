// lib/kodikIntegration.js
import { Client, VideoLinks } from 'kodikwrapper';

const KODIK_TOKEN = process.env.KODIK_PUBLIC_TOKEN || 'q8p5vnf9crt7xfyzke4iwc6r5rvsurv7';

class KodikIntegration {
  constructor() {
    this.client = Client.fromToken(KODIK_TOKEN);
  }

  // Извлекает ссылку из данных эпизода
  extractKodikLink(episodePlayer) {
    if (!episodePlayer || !episodePlayer.src) return null;
    
    const src = episodePlayer.src;
    
    if (src.includes('kodik.info') || src.includes('aniqit.com')) {
      // Убедимся что ссылка полная
      if (src.startsWith('//')) {
        return 'https:' + src;
      }
      if (!src.startsWith('http')) {
        return 'https://' + src;
      }
      return src;
    }
    
    return null;
  }

  // Получает прямые ссылки на видео
  async getDirectVideoLinks(kodikLink, options = {}) {
    try {
      if (!kodikLink) {
        throw new Error('Ссылка на Kodik не найдена');
      }

      // Добавляем заголовки для обхода блокировки
      const config = {
        link: kodikLink,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        referer: 'https://kodik.info/',
        ...options
      };

      // Таймаут 20 секунд
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 20000)
      );

      const links = await Promise.race([
        VideoLinks.getLinks(config),
        timeoutPromise
      ]);

      return links;
    } catch (error) {
      console.error('❌ Ошибка получения прямых ссылок:', error.message);
      return null;
    }
  }

  // Извлекает информацию о качестве видео
  extractVideoInfo(directLinks) {
    if (!directLinks) return null;

    const qualities = {};
    Object.keys(directLinks).forEach(quality => {
      const links = directLinks[quality];
      if (Array.isArray(links) && links.length > 0) {
        qualities[quality] = links.map(link => {
          const src = link.src.startsWith('//') ? 'https:' + link.src : link.src;
          return src;
        });
      }
    });

    return Object.keys(qualities).length > 0 ? qualities : null;
  }

  // Основная функция получения видео
  async getVideoFromEpisode(episodeData, options = {}) {
    try {
      const episode = episodeData.data;
      if (!episode?.players) {
        throw new Error('Плееры не найдены');
      }

      // Фильтруем только Kodik плееры
      const kodikPlayers = episode.players.filter(player => 
        player.player === 'Kodik' && player.src
      );

      if (kodikPlayers.length === 0) {
        throw new Error('Kodik плееры не найдены');
      }

      const results = [];
      
      // Обрабатываем последовательно с большими задержками
      for (const player of kodikPlayers) {
        const kodikLink = this.extractKodikLink(player);
        if (!kodikLink) continue;

        try {
          console.log(`🔍 Обрабатываем ${player.team?.name || 'Unknown'}...`);
          
          // Добавляем случайную задержку от 1 до 3 секунд перед каждым запросом
          await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
          
          const directLinks = await this.getDirectVideoLinks(kodikLink, options);
          const videoInfo = this.extractVideoInfo(directLinks);

          if (videoInfo) {
            console.log(`✅ Успех для ${player.team?.name}`);
            
            results.push({
              team: player.team?.name || 'Unknown',
              teamSlug: player.team?.slug,
              views: player.views || 0,
              translation: player.translation_type?.label,
              qualities: videoInfo,
              bestQuality: Object.keys(videoInfo).sort((a, b) => parseInt(b) - parseInt(a))[0]
            });
            
            // Если получили хотя бы 3 результата - останавливаемся
            if (results.length >= 3) {
              console.log('📊 Получено достаточно результатов, останавливаем обработку');
              break;
            }
          }
        } catch (error) {
          console.warn(`⚠️ Ошибка для ${player.team?.name}:`, error.message);
        }
      }

      return results.sort((a, b) => (b.views || 0) - (a.views || 0));

    } catch (error) {
      console.error('❌ Общая ошибка:', error.message);
      return [];
    }
  }

  // Альтернативный метод - использует parseLink для получения информации
  async getVideoInfoAlternative(episodeData) {
    try {
      const episode = episodeData.data;
      if (!episode?.players) {
        throw new Error('Плееры не найдены');
      }

      const kodikPlayers = episode.players
        .filter(player => player.player === 'Kodik' && player.src)
        .sort((a, b) => (b.views || 0) - (a.views || 0));

      const results = [];

      for (const player of kodikPlayers.slice(0, 5)) { // Только топ-5
        const kodikLink = this.extractKodikLink(player);
        if (!kodikLink) continue;

        try {
          console.log(`🔍 Парсим ссылку для ${player.team?.name}...`);
          
          // Используем parseLink вместо getLinks
          const parsedInfo = await VideoLinks.parseLink({
            link: kodikLink,
            extended: true
          });

          if (parsedInfo && parsedInfo.ex) {
            results.push({
              team: player.team?.name || 'Unknown',
              teamSlug: player.team?.slug,
              views: player.views || 0,
              translation: player.translation_type?.label,
              playerUrl: parsedInfo.ex.playerSingleUrl || kodikLink,
              iframeUrl: parsedInfo.iframeUrl,
              info: {
                type: parsedInfo.type,
                id: parsedInfo.id,
                translation: parsedInfo.translation,
                season: parsedInfo.season,
                episode: parsedInfo.episode
              }
            });
          }
        } catch (error) {
          console.warn(`⚠️ Ошибка парсинга для ${player.team?.name}`);
        }

        // Задержка между запросами
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      return results;

    } catch (error) {
      console.error('❌ Ошибка:', error.message);
      return [];
    }
  }
}

export default KodikIntegration;
