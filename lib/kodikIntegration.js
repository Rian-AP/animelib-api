// lib/kodikIntegration.js
import { Client, VideoLinks } from 'kodikwrapper';
import pLimit from 'p-limit'; // npm install p-limit

const KODIK_TOKEN = process.env.KODIK_PUBLIC_TOKEN || 'q8p5vnf9crt7xfyzke4iwc6r5rvsurv7';

// Глобальный лимитер для ВСЕХ запросов к Kodik API (максимум 2 параллельных запроса)
const globalKodikLimiter = pLimit(2);

// Простой in-memory кэш
const cache = new Map();
const CACHE_TTL = 3600000; // 1 час

class KodikIntegration {
  constructor() {
    this.client = Client.fromToken(KODIK_TOKEN);
  }

  // Извлекает ссылку из данных эпизода
  extractKodikLink(episodePlayer) {
    if (!episodePlayer || !episodePlayer.src) return null;
    
    const src = episodePlayer.src;
    
    if (src.includes('kodik.info') || src.includes('aniqit.com')) {
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

  // Получает прямые ссылки с кэшированием и повторными попытками
  async getDirectVideoLinks(kodikLink, options = {}, retryCount = 0) {
    try {
      if (!kodikLink) {
        throw new Error('Ссылка на Kodik не найдена');
      }

      // Проверяем кэш
      const cacheKey = `link:${kodikLink}`;
      const cached = cache.get(cacheKey);
      
      if (cached && cached.expires > Date.now()) {
        console.log('💾 Из кэша');
        return cached.data;
      }

      const config = {
        link: kodikLink,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        referer: 'https://kodik.info/',
        ...options
      };

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 15000)
      );

      // Используем глобальный лимитер для всех запросов к Kodik
      const links = await Promise.race([
        globalKodikLimiter(() => VideoLinks.getLinks(config)),
        timeoutPromise
      ]);

      // Сохраняем в кэш
      if (links) {
        cache.set(cacheKey, {
          data: links,
          expires: Date.now() + CACHE_TTL
        });
      }

      return links;
    } catch (error) {
      // Обработка ошибок и повторные попытки
      if (retryCount < 3 && (error.message.includes('not json') || error.message.includes('Timeout'))) {
        const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 500; // Экспоненциальная задержка
        console.log(`⏳ Повторная попытка ${retryCount + 1} через ${Math.round(delay)}ms для ${kodikLink}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.getDirectVideoLinks(kodikLink, options, retryCount + 1);
      }
      
      console.error('❌ Ошибка:', error.message);
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

  // ОСНОВНОЙ МЕТОД - получает видео с эпизода (имя исправлено для совместимости)
  async getVideoFromEpisode(episodeData, options = {}) {
    try {
      const episode = episodeData.data;
      if (!episode?.players) {
        throw new Error('Плееры не найдены');
      }

      // Фильтруем и сортируем плееры
      let kodikPlayers = episode.players
        .filter(player => player.player === 'Kodik' && player.src)
        .sort((a, b) => (b.views || 0) - (a.views || 0));

      if (kodikPlayers.length === 0) {
        throw new Error('Kodik плееры не найдены');
      }

      // Опции с более консервативными значениями по умолчанию
      const maxConcurrency = options.concurrency || 3; // Уменьшено с 5 до 3
      const maxPlayers = options.limit || Math.min(10, kodikPlayers.length); // Максимум 10 плееров
      const priorityTeams = options.priorityTeams || ['AniLibria.TV', 'Studio Band', 'AniDUB'];
      
      // Приоритизация популярных команд
      if (priorityTeams.length > 0) {
        const priority = [];
        const regular = [];
        
        kodikPlayers.forEach(player => {
          if (priorityTeams.includes(player.team?.name)) {
            priority.push(player);
          } else {
            regular.push(player);
          }
        });
        
        kodikPlayers = [...priority, ...regular];
      }

      // Ограничиваем количество
      kodikPlayers = kodikPlayers.slice(0, maxPlayers);

      console.log(`⚡ Обработка ${kodikPlayers.length} плееров (concurrency: ${maxConcurrency})`);
      
      // Создаем ограничитель параллельности
      const limit = pLimit(maxConcurrency);
      
      // Создаем задачи для параллельной обработки
      const tasks = kodikPlayers.map((player, index) => 
        limit(async () => {
          const kodikLink = this.extractKodikLink(player);
          if (!kodikLink) return null;

          try {
            const startTime = Date.now();
            console.log(`🔍 [${index + 1}/${kodikPlayers.length}] ${player.team?.name || 'Unknown'}`);
            
            // Добавляем небольшую задержку для распределения нагрузки
            if (index > 0) {
              await new Promise(resolve => 
                setTimeout(resolve, 500 + Math.random() * 300) // 0.5-0.8 секунд
              );
            }
            
            const directLinks = await this.getDirectVideoLinks(kodikLink, options);
            const videoInfo = this.extractVideoInfo(directLinks);
            
            const elapsed = Date.now() - startTime;

            if (videoInfo) {
              console.log(`✅ [${elapsed}ms] ${player.team?.name || 'Unknown'}`);
              return {
                team: player.team?.name || 'Unknown',
                teamSlug: player.team?.slug,
                views: player.views || 0,
                translation: player.translation_type?.label,
                qualities: videoInfo,
                bestQuality: Object.keys(videoInfo).sort((a, b) => parseInt(b) - parseInt(a))[0]
              };
            }
            
            console.log(`⚠️ [${elapsed}ms] ${player.team?.name || 'Unknown'} - нет ссылок`);
            return null;
          } catch (error) {
            console.warn(`❌ ${player.team?.name || 'Unknown'}: ${error.message}`);
            return null;
          }
        })
      );

      // Выполняем все задачи параллельно с ограничением
      const startTime = Date.now();
      const results = (await Promise.all(tasks))
        .filter(result => result !== null);
      
      const totalTime = Date.now() - startTime;
      console.log(`✅ Обработка завершена за ${totalTime}ms: ${results.length}/${kodikPlayers.length} успешно`);
      
      return results.sort((a, b) => (b.views || 0) - (a.views || 0));

    } catch (error) {
      console.error('❌ Ошибка:', error.message);
      return [];
    }
  }

  // АЛЬТЕРНАТИВНЫЙ МЕТОД - получает первые N работающих ссылок (быстрый режим)
  async getFirstWorkingLinks(episodeData, options = {}) {
    try {
      const episode = episodeData.data;
      if (!episode?.players) {
        throw new Error('Плееры не найдены');
      }

      const kodikPlayers = episode.players
        .filter(player => player.player === 'Kodik' && player.src)
        .sort((a, b) => (b.views || 0) - (a.views || 0));

      if (kodikPlayers.length === 0) {
        throw new Error('Kodik плееры не найдены');
      }

      // Более консервативные настройки по умолчанию
      const targetCount = options.count || 3; // Уменьшено с 5 до 3
      const maxConcurrency = options.concurrency || 2; // Уменьшено с 10 до 2
      
      console.log(`🚀 Получаем первые ${targetCount} работающих плеера`);
      
      const results = [];
      const limit = pLimit(maxConcurrency);
      let processedCount = 0;
      let isResolved = false;

      return new Promise((resolve) => {
        const tasks = kodikPlayers.map((player, index) => 
          limit(async () => {
            // Если уже набрали нужное количество или промис уже разрешен - пропускаем
            if (results.length >= targetCount || isResolved) {
              return;
            }

            const kodikLink = this.extractKodikLink(player);
            if (!kodikLink) return;

            try {
              processedCount++;
              console.log(`🔍 [${processedCount}/${kodikPlayers.length}] ${player.team?.name || 'Unknown'}`);
              
              // Добавляем задержку между запросами для распределения нагрузки
              if (index > 0) {
                await new Promise(resolve => 
                  setTimeout(resolve, 800 + Math.random() * 400) // 0.8-1.2 секунды
                );
              }
              
              const directLinks = await this.getDirectVideoLinks(kodikLink, options);
              const videoInfo = this.extractVideoInfo(directLinks);

              if (videoInfo && !isResolved) {
                const result = {
                  team: player.team?.name || 'Unknown',
                  teamSlug: player.team?.slug,
                  views: player.views || 0,
                  translation: player.translation_type?.label,
                  qualities: videoInfo,
                  bestQuality: Object.keys(videoInfo).sort((a, b) => parseInt(b) - parseInt(a))[0]
                };
                
                results.push(result);
                console.log(`✅ [${results.length}/${targetCount}] ${player.team?.name || 'Unknown'}`);
                
                // Если набрали нужное количество - завершаем
                if (results.length >= targetCount) {
                  console.log('🎯 Цель достигнута!');
                  isResolved = true;
                  resolve(results.sort((a, b) => (b.views || 0) - (a.views || 0)));
                }
              }
            } catch (error) {
              console.warn(`❌ ${player.team?.name || 'Unknown'}: ${error.message}`);
            }
          })
        );

        // Запускаем все задачи
        Promise.all(tasks).then(() => {
          if (!isResolved) {
            // Если не набрали нужное количество - возвращаем что есть
            console.log(`📊 Обработано ${processedCount} плееров, получено ${results.length} результатов`);
            isResolved = true;
            resolve(results.sort((a, b) => (b.views || 0) - (a.views || 0)));
          }
        });
      });

    } catch (error) {
      console.error('❌ Ошибка:', error.message);
      return [];
    }
  }

  // Очистка кэша
  clearCache() {
    cache.clear();
    console.log('🧹 Кэш очищен');
  }

  // Получение статистики кэша
  getCacheStats() {
    let validEntries = 0;
    const now = Date.now();
    
    cache.forEach((value) => {
      if (value.expires > now) validEntries++;
    });

    return {
      totalEntries: cache.size,
      validEntries,
      sizeEstimate: JSON.stringify([...cache]).length
    };
  }
}

export default KodikIntegration;
