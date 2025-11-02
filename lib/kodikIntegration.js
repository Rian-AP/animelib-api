// lib/kodikIntegration.js - ОПТИМИЗИРОВАНО ДЛЯ VERCEL
import puppeteer from 'puppeteer-core';

// Только для production на Vercel
let chromium;
if (process.env.NODE_ENV === 'production') {
  chromium = require('@sparticuz/chromium');
}

const KODIK_TOKEN = process.env.KODIK_PUBLIC_TOKEN || 'q8p5vnf9crt7xfyzke4iwc6r5rvsurv7';
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
];

// Конфигурация для разных сред
const getBrowserConfig = async () => {
  if (process.env.NODE_ENV === 'production') {
    // Конфигурация для Vercel
    return {
      args: [
        ...chromium.args,
        '--hide-scrollbars',
        '--disable-web-security',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ],
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    };
  } else {
    // Конфигурация для локальной разработки
    return {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security'
      ],
      executablePath: process.env.CHROME_PATH || 
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
    };
  }
};

export class KodikIntegration {
  static async makeRequest(path, params = {}) {
    const baseParams = {
      token: KODIK_TOKEN,
      with_episodes: true,
      with_seasons: true,
    };

    const searchParams = new URLSearchParams({
      ...baseParams,
      ...params
    });

    const url = `https://kodikapi.com/${path}?${searchParams}`;
    
    console.log(`Making request to: ${url.replace(KODIK_TOKEN, 'HIDDEN')}`);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Kodik API request failed:', error);
      throw error;
    }
  }

  static async searchContent(title, types = ['anime', 'foreign-movie', 'foreign-serial']) {
    try {
      const results = await this.makeRequest('search', {
        title,
        types: types.join(','),
        limit: 50
      });

      return results.results || [];
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  }

  static async getContentInfo(kodikId) {
    try {
      return await this.makeRequest('search', {
        id: kodikId,
        with_material_data: true
      });
    } catch (error) {
      console.error('Get content info failed:', error);
      return null;
    }
  }

  static async getPlayerContent(link) {
    try {
      const browser = await puppeteer.launch(await getBrowserConfig());
      
      try {
        const page = await browser.newPage();
        
        // Устанавливаем случайный User-Agent
        await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
        
        // Блокируем ненужные ресурсы для ускорения
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
            req.abort();
          } else {
            req.continue();
          }
        });

        console.log(`Navigating to: ${link}`);
        await page.goto(link, { 
          waitUntil: 'networkidle0',
          timeout: 30000 
        });

        // Ждем загрузки плеера
        await page.waitForSelector('video, .video-player, #player', { timeout: 10000 });

        // Получаем HTML содержимое
        const content = await page.content();
        
        // Ищем видео элементы и iframes
        const videoData = await page.evaluate(() => {
          const videos = Array.from(document.querySelectorAll('video'));
          const iframes = Array.from(document.querySelectorAll('iframe[src*="kodik"]'));
          
          return {
            videos: videos.map(video => ({
              src: video.src,
              poster: video.poster,
              innerHTML: video.innerHTML
            })),
            iframes: iframes.map(iframe => iframe.src),
            bodyHTML: document.body.innerHTML
          };
        });

        return {
          success: true,
          html: content,
          videoData
        };

      } finally {
        await browser.close();
      }
    } catch (error) {
      console.error('Failed to get player content:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default KodikIntegration;
