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

  extractKodikLink(episodePlayer) {
    try {
      if (!episodePlayer || !episodePlayer.src) return null;
      
      const src = episodePlayer.src;
      if (src.includes('kodik.info') || src.includes('aniqit.com')) {
        return src;
      }
      return null;
    } catch (error) {
      this.log('ERROR', 'Error extracting Kodik link', { episodePlayer, error });
      return null;
    }
  }

  getRandomUserAgent() {
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

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

  extractVideoInfo(directLinks) {
    try {
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
    } catch (error) {
      this.log('ERROR', 'Error extracting video info', { directLinks, error });
      return null;
    }
  }

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
        console.log(`❌ Прямые ссылки недоступны для ${baseInfo.team}, создаю iframe fallback`);
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

  async processAllPlayersWithDelay(kodikPlayers, delayMs = 2500) {
    const results = [];
    
    for (let i = 0; i < kodikPlayers.length; i++) {
      const player = kodikPlayers[i];
      
      this.log('INFO', `Processing player ${i + 1}/${kodikPlayers.length} with delay`);
      
      const result = await this.processSinglePlayer(player, i, kodikPlayers.length);
      
      if (result) {
        results.push(result);
      }
      
      // Задержка между запросами (кроме последнего)
      if (i < kodikPlayers.length - 1) {
        this.log('INFO', `Waiting ${delayMs}ms before next request...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    return results;
  }

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
        throw new Error('Плееры не найдены');
      }

      const kodikPlayers = episode.players.filter(player => 
        player.player === 'Kodik' && player.src
      );

      this.log('INFO', 'Kodik players found', {
        totalPlayers: episode.players.length,
        kodikPlayersCount: kodikPlayers.length,
        kodikTeams: kodikPlayers.map(p => p.team?.name)
      });

      if (kodikPlayers.length === 0) {
        throw new Error('Kodik плееры не найдены');
      }

      // ОБРАБАТЫВАЕМ ВСЕ ПЛЕЕРЫ с задержками
      const results = await this.processAllPlayersWithDelay(
        kodikPlayers, 
        options.delayMs || 2500
      );

      const totalDuration = this.logTiming(`getVideoFromEpisode-${this.requestCount}`, startTime, {
        requestId: this.requestCount,
        resultsCount: results.length,
        totalKodikPlayers: kodikPlayers.length
      });

      console.log(`🎯 Найдено ${results.length} плееров с прямыми ссылками из ${kodikPlayers.length}`);

      this.log('SUCCESS', 'Episode processing completed', {
        requestId: this.requestCount,
        totalDuration: `${totalDuration}ms`,
        resultsCount: results.length,
        totalKodikPlayers: kodikPlayers.length,
        successfulDirectLinks: results.filter(r => r.directLinksAvailable).length,
        fallbackIframes: results.filter(r => r.fallback).length
      });

      // Сортируем по популярности
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
}

export default KodikIntegration;
