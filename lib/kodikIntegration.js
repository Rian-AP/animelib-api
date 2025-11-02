// lib/kodikIntegration.js
import { Client, VideoLinks } from 'kodikwrapper';

const KODIK_TOKEN = process.env.KODIK_PUBLIC_TOKEN || 'q8p5vnf9crt7xfyzke4iwc6r5rvsurv7';
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101'
];

class KodikIntegration {
  constructor() {
    this.client = Client.fromToken(KODIK_TOKEN);
    this.requestCount = 0;
    this.requestTimings = [];
  }

  // Утилита для логирования
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

  // Получение случайного User-Agent
  getRandomUserAgent() {
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  // Поиск аниме через Kodik API
  async searchAnime(title, options = {}) {
    const startTime = Date.now();
    this.requestCount++;
    
    try {
      this.log('INFO', 'Search request started', {
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

      this.log('SUCCESS', 'Search completed', {
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

  // Извлекает ссылку из данных эпизода
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

  // Создает iframe fallback
  createIframeFallback(player) {
    try {
      const baseInfo = {
        team: player.team?.name || 'Unknown',
        teamSlug: player.team?.slug,
        views: player.views || 0,
        translation: player.translation_type?.label,
      };

      const kodikLink = this.extractKodikLink(player);
      if (!kodikLink) return null;

      const match = kodikLink.match(/\/seria\/(\d+)/);
      const episodeId = match ? match[1] : null;

      if (!episodeId) return null;

      this.log('INFO', 'Created iframe fallback', { team: baseInfo.team, episodeId });

      return {
        ...baseInfo,
        kodikLink: kodikLink.startsWith('//') ? 'https:' + kodikLink : kodikLink,
        directLinksAvailable: false,
        iframeUrl: `https://kodik.info/seria/${episodeId}`,
        embedType: 'iframe',
        fallback: true
      };
    } catch (error) {
      this.log('ERROR', 'Failed to create iframe fallback', { player, error });
      return null;
    }
  }

  // Получает прямые ссылки на видео (обычная версия)
  async getDirectVideoLinks(kodikLink, options = {}) {
    const startTime = Date.now();
    this.requestCount++;
    
    try {
      if (!kodikLink) {
        throw new Error('Ссылка на Kodik не найдена');
      }

      const timeoutMs = options.timeout || 6000;
      const userAgent = this.getRandomUserAgent();

      this.log('INFO', 'Getting direct video links', {
        requestId: this.requestCount,
        kodikLink: kodikLink.substring(0, 100),
        timeoutMs,
        userAgent: userAgent.substring(0, 50)
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          this.log('WARN', 'Request timeout', { requestId: this.requestCount, timeoutMs });
          reject(new Error(`Timeout: ${timeoutMs}ms exceeded`));
        }, timeoutMs);
      });

      const requestPromise = VideoLinks.getLinks({
        link: kodikLink,
        headers: {
          'User-Agent': userAgent,
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
          'Referer': 'https://kodik.info/',
          'Accept-Encoding': 'gzip, deflate, br'
        },
        ...options
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
        kodikLink: kodikLink.substring(0, 100),
        requestId: this.requestCount,
        error
      });
      return null;
    }
  }

  // ULTRA-FAST получение прямых ссылок
  async getDirectVideoLinksUltraFast(kodikLink, options = {}) {
    this.requestCount++;
    
    const timeoutMs = options.timeout || 2000; // Минимальный таймаут
    
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
      return null; // Быстро возвращаем null при ошибке
    }
  }

  // Извлекает информацию о качестве видео
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

  // Обработка одного плеера (обычная версия)
  async processSinglePlayer(player, playerIndex, totalPlayers) {
    const startTime = Date.now();
    
    try {
      this.log('INFO', `Processing player ${playerIndex + 1}/${totalPlayers}`, {
        playerTeam: player.team?.name,
        playerViews: player.views
      });

      const kodikLink = this.extractKodikLink(player);
      if (!kodikLink) {
        this.log('WARN', 'No valid Kodik link found', { playerIndex, playerTeam: player.team?.name });
        return null;
      }

      const baseInfo = {
        team: player.team?.name || 'Unknown',
        teamSlug: player.team?.slug,
        views: player.views || 0,
        translation: player.translation_type?.label,
        kodikLink: kodikLink.startsWith('//') ? 'https:' + kodikLink : kodikLink,
      };

      this.log('INFO', `Starting direct links request for ${baseInfo.team}`, {
        playerIndex,
        team: baseInfo.team
      });

      const directLinks = await this.getDirectVideoLinks(kodikLink);
      const elapsed = this.logTiming(`player-${playerIndex + 1}-${baseInfo.team}`, startTime, {
        playerIndex,
        team: baseInfo.team
      });
      
      console.log(`⏱️ Запрос занял ${elapsed}ms для ${baseInfo.team}`);
      
      const videoInfo = this.extractVideoInfo(directLinks);

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
          duration: `${elapsed}ms`
        });

        return result;
      } else {
        console.log(`❌ Прямые ссылки недоступны для ${baseInfo.team}`);
        return this.createIframeFallback(player);
      }
    } catch (playerError) {
      this.log('ERROR', `Error processing player ${playerIndex + 1}`, {
        playerIndex,
        playerTeam: player.team?.name,
        playerError
      });
      
      console.warn(`⚠️ Ошибка для ${player.team?.name}:`, playerError.message);
      return this.createIframeFallback(player);
    }
  }

  // ULTRA-FAST обработка плеера
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
    
    const videoInfo = this.extractVideoInfo(directLinks);

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

  // Главный метод (обычная версия с задержками)
  async getVideoFromEpisode(episodeData, options = {}) {
    const startTime = Date.now();
    this.requestCount++;
    
    try {
      this.log('INFO', 'Getting video from episode', {
        requestId: this.requestCount,
        options
      });

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

      // Настраиваем количество и режим
      const maxPlayers = options.maxPlayers || 6;
      const delayMs = options.delayMs || 2000;
      
      const topPlayers = kodikPlayers
        .sort((a, b) => (b.views || 0) - (a.views || 0))
        .slice(0, maxPlayers);

      this.log('DEBUG', 'Top players selected', {
        maxPlayers,
        selectedPlayers: topPlayers.length,
        selectedTeams: topPlayers.map(p => p.team?.name).filter(Boolean),
        views: topPlayers.map(p => p.views || 0)
      });

      const results = [];
      let processedCount = 0;
      
      // Обрабатываем с задержками
      for (const player of topPlayers) {
        processedCount++;
        const result = await this.processSinglePlayer(player, processedCount - 1, topPlayers.length);
        
        if (result) {
          results.push(result);
          this.log('SUCCESS', 'Player processed successfully', {
            team: result.team,
            resultsCount: results.length
          });
        }
        
        // Задержка между запросами
        if (processedCount < topPlayers.length) {
          this.log('INFO', `Waiting ${delayMs}ms before next request...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }

      const totalDuration = this.logTiming(`getVideoFromEpisode-${this.requestCount}`, startTime, {
        requestId: this.requestCount,
        resultsCount: results.length,
        processedPlayers: processedCount,
        totalKodikPlayers: kodikPlayers.length
      });

      console.log(`🎯 Найдено ${results.length} плееров с прямыми ссылками из ${kodikPlayers.length}`);

      this.log('SUCCESS', 'Episode processing completed', {
        requestId: this.requestCount,
        totalDuration: `${totalDuration}ms`,
        resultsCount: results.length,
        processedPlayers: processedCount,
        totalKodikPlayers: kodikPlayers.length
      });

      return results.sort((a, b) => (b.views || 0) - (a.views || 0));

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

  // ULTRA-FAST метод (все параллельно)
  async getVideoFromEpisodeUltraFast(episodeData) {
    console.log('🚀 ULTRA-FAST режим: получаем все плееры максимально быстро!');
    
    try {
      const episode = episodeData.data;
      if (!episode?.players) {
        throw new Error('Плееры не найдены');
      }

      const kodikPlayers = episode.players.filter(player => 
        player.player === 'Kodik' && player.src
      );

      console.log(`📋 Найдено ${kodikPlayers.length} Kodik плееров`);
      
      // ВСЕ плееры параллельно - максимальная скорость!
      const promises = kodikPlayers.map((player, index) => 
        this.processPlayerUltraFast(player, index)
      );

      const results = await Promise.all(promises);
      
      const totalTime = Date.now() - Date.now();
      const directCount = results.filter(r => r.directLinksAvailable).length;
      const iframeCount = results.filter(r => r.fallback).length;
      
      console.log(`🎯 ULTRA-FAST завершено!`);
      console.log(`✅ Прямые ссылки: ${directCount}/${results.length}`);
      console.log(`🔄 Iframe fallback: ${iframeCount}/${results.length}`);
      
      return results
        .filter(r => r !== null)
        .sort((a, b) => (b.views || 0) - (a.views || 0));
        
    } catch (error) {
      console.error('❌ ULTRA-FAST ошибка:', error.message);
      return [];
    }
  }

  // Умный метод (автоматически выбирает режим)
  async getVideoFromEpisodeSmart(episodeData) {
    const episode = episodeData.data;
    const allPlayers = episode.players.filter(p => p.player === 'Kodik' && p.src);
    
    const totalPlayers = allPlayers.length;
    
    if (totalPlayers <= 6) {
      // Мало плееров - используем ULTRA-FAST
      return await this.getVideoFromEpisodeUltraFast(episodeData);
    } else if (totalPlayers <= 15) {
      // Среднее количество - ограничиваем до 10 с задержками
      return await this.getVideoFromEpisode(episodeData, { 
        maxPlayers: 10, 
        delayMs: 1500 
      });
    } else {
      // Много плееров - ограничиваем до 12
      return await this.getVideoFromEpisode(episodeData, { 
        maxPlayers: 12, 
        delayMs: 1000 
      });
    }
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

  // Получение статистики запросов
  getRequestStats() {
    return {
      totalRequests: this.requestCount,
      averageTiming: this.requestTimings.length > 0 
        ? this.requestTimings.reduce((acc, t) => acc + t.duration, 0) / this.requestTimings.length
        : 0,
      timings: this.requestTimings
    };
  }

  // Диагностика API
  async diagnoseApi() {
    const startTime = Date.now();
    
    try {
      this.log('INFO', 'Starting API diagnostics');
      
      this.log('INFO', 'Token status', {
        tokenExists: !!KODIK_TOKEN,
        tokenLength: KODIK_TOKEN?.length || 0,
        tokenPrefix: KODIK_TOKEN?.substring(0, 8) + '...'
      });
      
      try {
        const searchResult = await this.client.search({ title: 'One Piece', limit: 1 });
        this.log('SUCCESS', 'Search test passed', {
          hasResults: !!searchResult?.results?.length,
          resultsCount: searchResult?.results?.length || 0
        });
      } catch (searchError) {
        this.log('ERROR', 'Search test failed', { searchError });
      }
      
      const duration = this.logTiming('diagnoseApi', startTime);
      this.log('SUCCESS', 'API diagnostics completed', { duration: `${duration}ms` });
      
    } catch (error) {
      this.log('ERROR', 'API diagnostics failed', { error });
    }
  }
}

export default KodikIntegration;
