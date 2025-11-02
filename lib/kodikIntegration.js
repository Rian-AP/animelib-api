// lib/kodikIntegration.js
import { Client, VideoLinks } from 'kodikwrapper';

// ВАЖНО: Получите токен на https://bd.kodik.biz/api/info
const KODIK_TOKEN = process.env.KODIK_PUBLIC_TOKEN || 'q8p5vnf9crt7xfyzke4iwc6r5rvsurv7';

class KodikIntegration {
  constructor() {
    this.client = Client.fromToken(KODIK_TOKEN);
    this.requestCount = 0;
    this.requestTimings = [];
  }

  // Утилита для детального логирования
  log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [KODIK-${level}]`;
    
    if (data.error) {
      console.error(`${prefix} ${message}`, {
        error: data.error.message,
        stack: data.error.stack,
        ...data
      });
    } else {
      console.log(`${prefix} ${message}`, data);
    }
  }

  // Логирование заголовков HTTP ответа
  logResponseDetails(url, response, body) {
    this.log('DEBUG', `HTTP Response Details`, {
      url,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      bodyLength: body?.length || 0,
      bodyPreview: body?.substring(0, 500) || 'No body'
    });
  }

  // Логирование времени выполнения
  logTiming(operation, startTime, additional = {}) {
    const duration = Date.now() - startTime;
    this.requestTimings.push({ operation, duration });
    
    this.log('TIMING', `Operation completed`, {
      operation,
      duration: `${duration}ms`,
      ...additional
    });

    return duration;
  }

  // Поиск аниме через Kodik API
  async searchAnime(title, options = {}) {
    const startTime = Date.now();
    this.requestCount++;
    
    try {
      this.log('INFO', `Search request started`, {
        requestId: this.requestCount,
        title,
        options
      });

      const response = await this.client.search({
        limit: options.limit || 10,
        title: title,
        ...options
      });

      const duration = this.logTiming('searchAnime', startTime, {
        resultsCount: response?.results?.length || 0,
        hasResults: !!response?.results?.length
      });

      this.log('SUCCESS', `Search completed`, {
        title,
        resultsCount: response?.results?.length || 0,
        duration: `${duration}ms`
      });

      return response.results || [];
    } catch (error) {
      this.log('ERROR', 'Search failed', { 
        title, 
        options,
        error 
      });
      
      return [];
    }
  }

  // Извлекает ссылку из данных эпизода нашего API
  extractKodikLink(episodePlayer) {
    try {
      if (!episodePlayer || !episodePlayer.src) {
        this.log('DEBUG', 'No episodePlayer or src found', { episodePlayer });
        return null;
      }
      
      const src = episodePlayer.src;
      this.log('DEBUG', 'Extracting Kodik link', {
        src,
        episodePlayer
      });
      
      // Проверяем что это действительно Kodik ссылка
      if (src.includes('kodik.info') || src.includes('aniqit.com')) {
        this.log('SUCCESS', 'Valid Kodik link extracted', { extractedSrc: src });
        return src;
      }
      
      this.log('WARN', 'Invalid Kodik link format', { src });
      return null;
    } catch (error) {
      this.log('ERROR', 'Error extracting Kodik link', { 
        episodePlayer, 
        error 
      });
      return null;
    }
  }

  // Получает прямые ссылки на видео через kodikwrapper
  async getDirectVideoLinks(kodikLink, options = {}) {
    const startTime = Date.now();
    this.requestCount++;
    
    try {
      if (!kodikLink) {
        throw new Error('Ссылка на Kodik не найдена');
      }

      const timeoutMs = options.timeout || 8000;
      this.log('INFO', 'Getting direct video links', {
        requestId: this.requestCount,
        kodikLink,
        timeoutMs,
        options
      });

      // Добавляем таймаут для запроса
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          this.log('WARN', 'Main request timeout', { 
            requestId: this.requestCount, 
            timeoutMs 
          });
          reject(new Error(`Timeout: Kodik request took more than ${timeoutMs}ms`));
        }, timeoutMs);
      });

      const requestPromise = VideoLinks.getLinks({
        link: kodikLink,
        ...options
      });

      this.log('DEBUG', 'Starting Promise.race', {
        requestId: this.requestCount,
        timeoutMs
      });

      const links = await Promise.race([requestPromise, timeoutPromise]);

      const duration = this.logTiming('getDirectVideoLinks', startTime, {
        requestId: this.requestCount,
        hasLinks: !!links,
        linksCount: Object.keys(links || {}).length
      });

      this.log('SUCCESS', 'Direct video links obtained', {
        requestId: this.requestCount,
        linksCount: Object.keys(links || {}).length,
        duration: `${duration}ms`
      });

      return links;
    } catch (error) {
      this.log('ERROR', 'Error getting direct video links', {
        kodikLink,
        options,
        requestId: this.requestCount,
        error
      });

      // Fallback - пробуем с актуальным endpoint
      try {
        this.log('INFO', 'Trying fallback method', {
          requestId: this.requestCount,
          errorReason: error.message
        });

        const fallbackTimeoutMs = options.fallbackTimeout || 5000;
        const fallbackTimeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            this.log('WARN', 'Fallback request timeout', {
              requestId: this.requestCount,
              fallbackTimeoutMs
            });
            reject(new Error(`Timeout: Fallback request took more than ${fallbackTimeoutMs}ms`));
          }, fallbackTimeoutPromise);
        });

        const parsedLink = await VideoLinks.parseLink({
          link: kodikLink, 
          extended: true
        });

        this.log('DEBUG', 'Parsed link successfully', {
          requestId: this.requestCount,
          hasPlayerSingleUrl: !!parsedLink.ex?.playerSingleUrl
        });

        if (!parsedLink.ex?.playerSingleUrl) {
          throw new Error('Не удалось получить ссылку на плеер');
        }

        const endpoint = await VideoLinks.getActualVideoInfoEndpoint(
          parsedLink.ex.playerSingleUrl
        );

        this.log('DEBUG', 'Got actual endpoint', {
          requestId: this.requestCount,
          endpoint
        });

        const fallbackPromise = VideoLinks.getLinks({
          link: kodikLink,
          videoInfoEndpoint: endpoint
        });

        const links = await Promise.race([fallbackPromise, fallbackTimeoutPromise]);

        const duration = this.logTiming('getDirectVideoLinks-fallback', startTime, {
          requestId: this.requestCount,
          method: 'fallback',
          hasLinks: !!links,
          linksCount: Object.keys(links || {}).length
        });

        this.log('SUCCESS', 'Fallback method succeeded', {
          requestId: this.requestCount,
          linksCount: Object.keys(links || {}).length,
          duration: `${duration}ms`
        });

        return links;
      } catch (fallbackError) {
        this.log('ERROR', 'Fallback method failed', {
          requestId: this.requestCount,
          originalError: error.message,
          fallbackError
        });
        
        return null;
      }
    }
  }

  // Получает информацию о качестве видео
  extractVideoInfo(directLinks) {
    try {
      if (!directLinks) {
        this.log('DEBUG', 'No direct links provided for extraction');
        return null;
      }

      this.log('DEBUG', 'Extracting video info', {
        rawLinks: Object.keys(directLinks)
      });

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

      this.log('SUCCESS', 'Video info extracted', {
        qualities: Object.keys(qualities)
      });

      return qualities;
    } catch (error) {
      this.log('ERROR', 'Error extracting video info', {
        directLinks,
        error
      });
      return null;
    }
  }

  // Обработка одного плеера
  async processSinglePlayer(player, playerIndex, totalPlayers) {
    const startTime = Date.now();
    
    try {
      this.log('INFO', `Processing player ${playerIndex + 1}/${totalPlayers}`, {
        playerTeam: player.team?.name,
        playerViews: player.views,
        playerSrc: player.src?.substring(0, 100)
      });

      // Извлекаем Kodik ссылку
      const kodikLink = this.extractKodikLink(player);
      if (!kodikLink) {
        this.log('WARN', 'No valid Kodik link found', {
          playerIndex,
          playerTeam: player.team?.name
        });
        return null;
      }

      // Базовая информация о плеере
      const baseInfo = {
        team: player.team?.name || 'Unknown',
        teamSlug: player.team?.slug,
        views: player.views || 0,
        translation: player.translation_type?.label,
        kodikLink: kodikLink.startsWith('//') ? 'https:' + kodikLink : kodikLink,
      };

      this.log('INFO', `Starting direct links request for ${baseInfo.team}`, {
        playerIndex,
        team: baseInfo.team,
        kodikLink: baseInfo.kodikLink.substring(0, 100)
      });

      // Пытаемся получить прямые ссылки
      const directLinks = await this.getDirectVideoLinks(kodikLink);
      const elapsed = this.logTiming(`player-${playerIndex + 1}-${baseInfo.team}`, startTime, {
        playerIndex,
        team: baseInfo.team,
        kodikLink: baseInfo.kodikLink.substring(0, 100)
      });
      
      console.log(`⏱️ Запрос занял ${elapsed}ms для ${baseInfo.team}`);
      
      const videoInfo = this.extractVideoInfo(directLinks);

      // ВАЖНО: Возвращаем только если есть прямые ссылки
      if (videoInfo && Object.keys(videoInfo).length > 0) {
        console.log(`✅ Прямые ссылки получены для ${baseInfo.team}`);
        const result = {
          ...baseInfo,
          directLinks: videoInfo,
          quality: Object.keys(videoInfo).sort((a, b) => parseInt(b) - parseInt(a))[0],
          directLinksAvailable: true
        };

        this.log('SUCCESS', `Player processed successfully`, {
          playerIndex,
          team: baseInfo.team,
          quality: result.quality,
          qualities: Object.keys(videoInfo),
          duration: `${elapsed}ms`
        });

        return result;
      } else {
        console.log(`❌ Прямые ссылки недоступны для ${baseInfo.team}`);
        this.log('WARN', 'No direct links available', {
          playerIndex,
          team: baseInfo.team,
          duration: `${elapsed}ms`
        });
        return null;
      }
    } catch (playerError) {
      this.log('ERROR', `Error processing player ${playerIndex + 1}`, {
        playerIndex,
        playerTeam: player.team?.name,
        playerError
      });
      
      console.warn(`⚠️ Ошибка получения прямых ссылок для ${player.team?.name}:`, playerError.message);
      return null;
    }
  }

  // Интегрированная функция - получает видео из нашего API и конвертирует в прямые ссылки
  async getVideoFromEpisode(episodeData, options = {}) {
    const startTime = Date.now();
    this.requestCount++;
    
    try {
      this.log('INFO', 'Getting video from episode', {
        requestId: this.requestCount,
        episodeDataAvailable: !!episodeData,
        options
      });

      // Проверяем входные данные
      if (!episodeData) {
        throw new Error('episodeData не предоставлен');
      }

      const episode = episodeData.data;
      if (!episode?.players) {
        this.log('ERROR', 'No players found in episode data', {
          episodeData: Object.keys(episodeData),
          hasData: !!episodeData?.data,
          hasPlayers: !!episodeData?.data?.players
        });
        throw new Error('Плееры не найдены');
      }

      this.log('DEBUG', 'Episode data processed', {
        playersCount: episode.players.length,
        playerNames: episode.players.map(p => p.team?.name).filter(Boolean)
      });

      // Ищем Kodik плееры
      const kodikPlayers = episode.players.filter(player => 
        player.player === 'Kodik' && player.src
      );

      this.log('INFO', 'Kodik players found', {
        totalPlayers: episode.players.length,
        kodikPlayersCount: kodikPlayers.length,
        kodikTeams: kodikPlayers.map(p => p.team?.name).filter(Boolean)
      });

      if (kodikPlayers.length === 0) {
        throw new Error('Kodik плееры не найдены');
      }

      // Сортируем по популярности (views) и берём только топ-3 для экономии времени
      const maxPlayers = options.maxPlayers || 3;
      const topPlayers = kodikPlayers
        .sort((a, b) => (b.views || 0) - (a.views || 0))
        .slice(0, maxPlayers);

      this.log('DEBUG', 'Top players selected', {
        maxPlayers,
        selectedPlayers: topPlayers.length,
        selectedTeams: topPlayers.map(p => p.team?.name).filter(Boolean),
        views: topPlayers.map(p => p.views || 0)
      });

      // Последовательная обработка для избежания таймаутов
      const results = [];
      let processedCount = 0;
      
      for (const player of topPlayers) {
        processedCount++;
        const result = await this.processSinglePlayer(player, processedCount - 1, topPlayers.length);
        
        if (result) {
          results.push(result);
          this.log('SUCCESS', 'First successful player found, stopping', {
            team: result.team,
            resultsCount: results.length
          });
          break; // Берем первый успешный результат
        }
      }

      const totalDuration = this.logTiming(`getVideoFromEpisode-${this.requestCount}`, startTime, {
        requestId: this.requestCount,
        resultsCount: results.length,
        processedPlayers: processedCount,
        totalKodikPlayers: kodikPlayers.length,
        avgTimePerPlayer: results.length > 0 ? totalDuration / processedCount : 0
      });

      console.log(`🎯 Найдено ${results.length} плееров с прямыми ссылками из ${kodikPlayers.length}`);

      this.log('SUCCESS', 'Episode processing completed', {
        requestId: this.requestCount,
        totalDuration: `${totalDuration}ms`,
        resultsCount: results.length,
        processedPlayers: processedCount,
        totalKodikPlayers: kodikPlayers.length
      });

      return results;

    } catch (error) {
      const totalDuration = Date.now() - startTime;
      this.log('ERROR', 'General integration error', {
        requestId: this.requestCount,
        duration: `${totalDuration}ms`,
        error
      });
      
      console.error('❌ Общая ошибка интеграции:', error.message);
      return [];
    }
  }

  // Метод для получения статистики запросов
  getRequestStats() {
    return {
      totalRequests: this.requestCount,
      averageTiming: this.requestTimings.length > 0 
        ? this.requestTimings.reduce((acc, t) => acc + t.duration, 0) / this.requestTimings.length
        : 0,
      timings: this.requestTimings
    };
  }

  // Метод для диагностики API
  async diagnoseApi() {
    const startTime = Date.now();
    
    try {
      this.log('INFO', 'Starting API diagnostics');
      
      // Проверяем токен
      this.log('INFO', 'Token status', {
        tokenExists: !!KODIK_TOKEN,
        tokenLength: KODIK_TOKEN?.length || 0,
        tokenPrefix: KODIK_TOKEN?.substring(0, 8) + '...'
      });
      
      // Тест поиска
      try {
        const searchResult = await this.client.search({ title: 'One Piece', limit: 1 });
        this.log('SUCCESS', 'Search test passed', {
          hasResults: !!searchResult?.results?.length,
          resultsCount: searchResult?.results?.length || 0
        });
      } catch (searchError) {
        this.log('ERROR', 'Search test failed', { searchError });
      }
      
      // Тест простого запроса видео
      try {
        const testLink = 'https://kodik.info/seria/test12345';
        const parseResult = await VideoLinks.parseLink({ link: testLink, extended: true });
        this.log('SUCCESS', 'Parse link test passed', {
          hasEx: !!parseResult.ex
        });
      } catch (parseError) {
        this.log('ERROR', 'Parse link test failed', { parseError });
      }
      
      const duration = this.logTiming('diagnoseApi', startTime);
      this.log('SUCCESS', 'API diagnostics completed', { duration: `${duration}ms` });
      
    } catch (error) {
      this.log('ERROR', 'API diagnostics failed', { error });
    }
  }
}

export default KodikIntegration;
