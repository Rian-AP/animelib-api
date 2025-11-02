// lib/kodikIntegration.js - ПУШКА ДЛЯ ПРЯМЫХ ССЫЛОК!
import puppeteer from 'puppeteer';

const KODIK_TOKEN = process.env.KODIK_PUBLIC_TOKEN || 'q8p5vnf9crt7xfyzke4iwc6r5rvsurv7';
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

class KodikIntegration {
  constructor() {
    this.client = null; // Не используем kodikwrapper
    this.browser = null;
  }

  async getBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ]
      });
    }
    return this.browser;
  }

  async getVideoFromEpisode(episodeData) {
    const startTime = Date.now();
    
    const episode = episodeData?.data;
    if (!episode?.players) return [];
    
    const kodikPlayers = episode.players.filter(p => p.player === 'Kodik' && p.src);
    if (kodikPlayers.length === 0) return [];
    
    const browser = await this.getBrowser();
    
    // Параллельно обрабатываем ВСЕХ плееров
    const promises = kodikPlayers.map(player => this.getDirectLinksViaBrowser(player));
    const results = await Promise.allSettled(promises);
    
    const successful = results
      .map((result, index) => result.status === 'fulfilled' ? result.value : null)
      .filter(player => player !== null)
      .sort((a, b) => (b.views || 0) - (a.views || 0));
    
    const totalTime = Date.now() - startTime;
    console.log(`🎯 ПРЯМЫЕ ССЫЛКИ: ${successful.length}/${kodikPlayers.length} плееров за ${totalTime}ms`);
    
    return successful;
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

    const page = await (await this.getBrowser()).newPage();
    
    try {
      // Настраиваем как реальный браузер
      await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://kodik.info/',
        'Origin': 'https://kodik.info'
      });
      
      // Отключаем лишние запросы
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
          req.abort();
        } else {
          req.continue();
        }
      });
      
      // Переходим на страницу
      const fullUrl = src.startsWith('//') ? 'https:' + src : src;
      await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 15000 });
      
      // Ждём загрузки видео
      await page.waitForSelector('video, .player-container, .player', { timeout: 10000 });
      
      // Извлекаем ссылки
      const videoData = await page.evaluate(() => {
        const video = document.querySelector('video');
        const sources = [];
        
        if (video) {
          // Прямые источники video
          const videoSources = video.querySelectorAll('source');
          videoSources.forEach(source => {
            sources.push({
              src: source.src,
              type: source.type || 'video/mp4',
              quality: 'auto'
            });
          });
          
          // Если у video есть src
          if (video.src && video.src !== '') {
            sources.push({
              src: video.src,
              type: 'video/mp4',
              quality: 'auto'
            });
          }
        }
        
        // Ищем в JavaScript коде
        const scripts = document.querySelectorAll('script');
        let foundSources = [];
        
        scripts.forEach(script => {
          const content = script.textContent || script.innerHTML;
          if (content.includes('.mp4') || content.includes('.m3u8')) {
            const urlRegex = /https?:\/\/[^\s"']+\.(?:mp4|m3u8|webm|mkv)/g;
            const matches = content.match(urlRegex);
            if (matches) {
              foundSources = matches.concat(foundSources);
            }
          }
        });
        
        return { sources, foundSources };
      });
      
      // Объединяем все найденные ссылки
      const allSources = [
        ...videoData.sources,
        ...videoData.foundSources.map(src => ({
          src: src,
          type: src.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4',
          quality: 'auto'
        }))
      ];
      
      // Удаляем дубликаты
      const uniqueSources = allSources.filter((source, index, self) =>
        index === self.findIndex(s => s.src === source.src)
      );
      
      if (uniqueSources.length > 0) {
        // Группируем по типам
        const qualities = {
          '720': uniqueSources.filter(s => s.src.includes('720') || s.src.includes('hd')),
          '480': uniqueSources.filter(s => s.src.includes('480') || s.src.includes('sd')),
          '360': uniqueSources.filter(s => s.src.includes('360')),
          'auto': uniqueSources.filter(s => !s.src.includes('720') && !s.src.includes('480') && !s.src.includes('360'))
        };
        
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
      await page.close();
    }
    
    return null; // ТОЛЬКО прямые ссылки, никаких fallback!
  }
  
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export default KodikIntegration;
