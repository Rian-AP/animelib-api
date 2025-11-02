// lib/kodikIntegration.js - ОПТИМИЗИРОВАНО ДЛЯ VERCEL
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const KODIK_TOKEN = process.env.KODIK_PUBLIC_TOKEN || 'q8p5vnf9crt7xfyzke4iwc6r5rvsurv7';
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

// Конфигурация Chromium для Vercel
chromium.setGraphicsMode = false;

class KodikIntegration {
  constructor() {
    this.browser = null;
    this.browserPromise = null;
  }

  async getBrowser() {
    if (this.browser) return this.browser;
    
    if (!this.browserPromise) {
      this.browserPromise = puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
      });
    }
    
    this.browser = await this.browserPromise;
    return this.browser;
  }

  async getVideoFromEpisode(episodeData) {
    const startTime = Date.now();
    
    const episode = episodeData?.data;
    if (!episode?.players) return [];
    
    const kodikPlayers = episode.players.filter(p => p.player === 'Kodik' && p.src);
    if (kodikPlayers.length === 0) return [];
    
    try {
      const browser = await this.getBrowser();
      
      // Ограничиваем параллелизм для Vercel
      const batchSize = 2;
      const results = [];
      
      for (let i = 0; i < kodikPlayers.length; i += batchSize) {
        const batch = kodikPlayers.slice(i, i + batchSize);
        const batchPromises = batch.map(player => this.getDirectLinksViaBrowser(player));
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value !== null) {
            results.push(result.value);
          }
        });
        
        // Небольшая пауза между батчами
        if (i + batchSize < kodikPlayers.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      const successful = results.sort((a, b) => (b.views || 0) - (a.views || 0));
      const totalTime = Date.now() - startTime;
      console.log(`🎯 ПРЯМЫЕ ССЫЛКИ: ${successful.length}/${kodikPlayers.length} плееров за ${totalTime}ms`);
      
      return successful;
    } catch (error) {
      console.error('❌ Browser initialization failed:', error);
      return [];
    }
  }

  async getDirectLinksViaBrowser(player) {
    const src = player.src;
    if (!src?.includes('kodik')) return null;
    
    const baseInfo = {
      team: player.team?.name || 'Unknown',
      views: player.views || 0,
      translation: player.translation_type?.label,
      kodikLink: src.startsWith('//') ? 'https:' + src : src,
    };

    let page;
    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();
      
      // Устанавливаем таймауты
      page.setDefaultTimeout(10000);
      page.setDefaultNavigationTimeout(15000);
      
      // Настраиваем как реальный браузер
      await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Referer': 'https://kodik.info/',
      });
      
      // Блокируем ресурсы для ускорения
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });
      
      // Переходим на страницу
      const fullUrl = src.startsWith('//') ? 'https:' + src : src;
      await page.goto(fullUrl, { 
        waitUntil: 'domcontentloaded', 
        timeout: 15000 
      });
      
      // Ждём загрузки видео элементов
      try {
        await page.waitForSelector('video, [class*="player"], [id*="player"]', { 
          timeout: 8000 
        });
      } catch (e) {
        console.log(`⏰ Timeout waiting for player: ${baseInfo.team}`);
      }
      
      // Извлекаем ссылки
      const videoData = await page.evaluate(() => {
        const results = {
          sources: [],
          foundSources: [],
          videoSrc: null
        };
        
        // Ищем video элементы
        const video = document.querySelector('video');
        if (video) {
          // Прямые источники video
          const videoSources = video.querySelectorAll('source');
          videoSources.forEach(source => {
            if (source.src) {
              results.sources.push({
                src: source.src,
                type: source.type || 'video/mp4',
                quality: 'auto'
              });
            }
          });
          
          // Если у video есть прямой src
          if (video.src && video.src.startsWith('http')) {
            results.videoSrc = video.src;
          }
        }
        
        // Ищем в JavaScript коде
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const script of scripts) {
          const content = script.textContent || script.innerHTML;
          if (content.includes('.mp4') || content.includes('.m3u8')) {
            const urlRegex = /https?:\/\/[^\s"']+\.(mp4|m3u8|webm|mkv)[^\s"']*/gi;
            const matches = content.match(urlRegex);
            if (matches) {
              results.foundSources.push(...matches);
            }
          }
        }
        
        return results;
      });
      
      // Объединяем все найденные ссылки
      let allSources = [...videoData.sources];
      
      if (videoData.videoSrc) {
        allSources.push({
          src: videoData.videoSrc,
          type: 'video/mp4',
          quality: 'auto'
        });
      }
      
      videoData.foundSources.forEach(src => {
        allSources.push({
          src: src,
          type: src.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4',
          quality: 'auto'
        });
      });
      
      // Удаляем дубликаты и невалидные ссылки
      const uniqueSources = allSources
        .filter(source => source.src && source.src.startsWith('http'))
        .filter((source, index, self) =>
          index === self.findIndex(s => s.src === source.src)
        );
      
      if (uniqueSources.length > 0) {
        // Группируем по качеству
        const qualities = {};
        
        uniqueSources.forEach(source => {
          let quality = 'auto';
          if (source.src.includes('720') || source.src.includes('hd')) quality = '720';
          else if (source.src.includes('480') || source.src.includes('sd')) quality = '480';
          else if (source.src.includes('360')) quality = '360';
          
          if (!qualities[quality]) qualities[quality] = [];
          qualities[quality].push(source);
        });
        
        // Убираем пустые качества
        Object.keys(qualities).forEach(key => {
          if (qualities[key].length === 0) {
            delete qualities[key];
          }
        });
        
        if (Object.keys(qualities).length > 0) {
          return {
            ...baseInfo,
            directLinks: qualities,
            quality: Object.keys(qualities)[0],
            directLinksAvailable: true
          };
        }
      }
      
    } catch (error) {
      console.log(`❌ Browser failed for ${baseInfo.team}:`, error.message);
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
    
    return null;
  }
  
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.browserPromise = null;
    }
  }
}

export default KodikIntegration;
