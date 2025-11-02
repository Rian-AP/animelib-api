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

      // Получаем лимит из опций или используем все плееры
      const limit = options.limit || kodikPlayers.length;
      const minDelay = options.minDelay || 800; // Минимальная задержка
      const maxDelay = options.maxDelay || 1500; // Максимальная задержка

      const results = [];
      let processedCount = 0;
      
      // Обрабатываем последовательно
      for (const player of kodikPlayers) {
        if (processedCount >= limit) {
          console.log(`📊 Достигнут лимит в ${limit} плееров`);
          break;
        }

        const kodikLink = this.extractKodikLink(player);
        if (!kodikLink) continue;

        try {
          console.log(`🔍 [${processedCount + 1}/${Math.min(limit, kodikPlayers.length)}] Обрабатываем ${player.team?.name || 'Unknown'}...`);
          
          // Добавляем случайную задержку между запросами (кроме первого)
          if (processedCount > 0) {
            const delay = minDelay + Math.random() * (maxDelay - minDelay);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
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
          } else {
            console.log(`⚠️ Нет прямых ссылок для ${player.team?.name}`);
          }
        } catch (error) {
          console.warn(`⚠️ Ошибка для ${player.team?.name}:`, error.message);
        }

        processedCount++;
      }

      console.log(`📊 Обработано ${processedCount} плееров, получено ${results.length} результатов`);
      
      return results.sort((a, b) => (b.views || 0) - (a.views || 0));

    } catch (error) {
      console.error('❌ Общая ошибка:', error.message);
      return [];
    }
  }

  // Получение видео с батчевой обработкой для большого количества плееров
  async getVideoFromEpisodeBatch(episodeData, options = {}) {
    try {
      const episode = episodeData.data;
      if (!episode?.players) {
        throw new Error('Плееры не найдены');
      }

      const kodikPlayers = episode.players.filter(player => 
        player.player === 'Kodik' && player.src
      );

      if (kodikPlayers.length === 0) {
        throw new Error('Kodik плееры не найдены');
      }

      const batchSize = options.batchSize || 2; // Размер батча
      const batchDelay = options.batchDelay || 2000; // Задержка между батчами
      const results = [];
      
      console.log(`📊 Всего плееров для обработки: ${kodikPlayers.length}`);
      
      for (let i = 0; i < kodikPlayers.length; i += batchSize) {
        const batch = kodikPlayers.slice(i, i + batchSize);
        console.log(`🔄 Обработка батча ${Math.floor(i/batchSize) + 1}/${Math.ceil(kodikPlayers.length/batchSize)}`);
        
        const batchPromises = batch.map(async (player) => {
          const kodikLink = this.extractKodikLink(player);
          if (!kodikLink) return null;

          try {
            console.log(`  🔍 ${player.team?.name || 'Unknown'}`);
            
            const directLinks = await this.getDirectVideoLinks(kodikLink, options);
            const videoInfo = this.extractVideoInfo(directLinks);

            if (videoInfo) {
              console.log(`  ✅ ${player.team?.name}`);
              return {
                team: player.team?.name || 'Unknown',
                teamSlug: player.team?.slug,
                views: player.views || 0,
                translation: player.translation_type?.label,
                qualities: videoInfo,
                bestQuality: Object.keys(videoInfo).sort((a, b) => parseInt(b) - parseInt(a))[0]
              };
            }
            
            console.log(`  ⚠️ ${player.team?.name} - нет ссылок`);
            return null;
          } catch (error) {
            console.warn(`  ❌ ${player.team?.name}: ${error.message}`);
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults.filter(result => result !== null));
        
        // Задержка между батчами (кроме последнего)
        if (i + batchSize < kodikPlayers.length) {
          console.log(`⏳ Задержка ${batchDelay}ms перед следующим батчем...`);
          await new Promise(resolve => setTimeout(resolve, batchDelay));
        }
      }

      console.log(`✅ Обработка завершена: ${results.length} успешных результатов из ${kodikPlayers.length}`);
      
      return results.sort((a, b) => (b.views || 0) - (a.views || 0));

    } catch (error) {
      console.error('❌ Общая ошибка:', error.message);
      return [];
    }
  }
}

export default KodikIntegration;
