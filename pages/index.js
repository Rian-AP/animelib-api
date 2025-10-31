import { useState } from 'react';

export default function Documentation() {
  const [activeTab, setActiveTab] = useState('overview');
  const baseUrl = 'https://animelib-api.vercel.app';

  const endpoints = [
    {
      id: 'search',
      title: 'Поиск аниме',
      method: 'GET',
      path: '/api/proxy/anime',
      description: 'Поиск аниме по названию с поддержкой пагинации',
      params: [
        { name: 'q', type: 'string', required: true, description: 'Поисковый запрос' },
        { name: 'limit', type: 'number', required: false, description: 'Количество результатов (10-60, default: 20)' },
        { name: 'page', type: 'number', required: false, description: 'Номер страницы (default: 1)' },
      ],
      example: `${baseUrl}/api/proxy/anime?q=naruto&limit=10`,
    },
    {
      id: 'anime-details',
      title: 'Информация о тайтле',
      method: 'GET',
      path: '/api/proxy/anime/{slug_url}',
      description: 'Получить детальную информацию об аниме по slug_url',
      params: [
        { name: 'slug_url', type: 'string', required: true, description: 'URL идентификатор из поиска (например: 16133--jujutsu-kaisen-anime)' },
      ],
      example: `${baseUrl}/api/proxy/anime/16133--jujutsu-kaisen-anime`,
    },
    {
      id: 'episodes-list',
      title: 'Список эпизодов',
      method: 'GET',
      path: '/api/proxy/episodes',
      description: 'Получить список всех эпизодов аниме',
      params: [
        { name: 'anime_id', type: 'number', required: true, description: 'ID аниме' },
        { name: 'limit', type: 'number', required: false, description: 'Количество результатов (10+)' },
      ],
      example: `${baseUrl}/api/proxy/episodes?anime_id=16133&limit=24`,
    },
    {
      id: 'episode-details',
      title: 'Детали эпизода',
      method: 'GET',
      path: '/api/proxy/episodes/{id}',
      description: 'Получить информацию о конкретном эпизоде с плеерами Kodik',
      params: [
        { name: 'id', type: 'number', required: true, description: 'ID эпизода' },
      ],
      example: `${baseUrl}/api/proxy/episodes/41924`,
    },
    {
      id: 'kodik-links',
      title: 'Прямые видео-ссылки',
      method: 'GET',
      path: '/api/kodik/episode',
      description: 'Получить прямые ссылки на видео через Kodik (360p, 480p, 720p)',
      params: [
        { name: 'episode_id', type: 'number', required: true, description: 'ID эпизода' },
      ],
      example: `${baseUrl}/api/kodik/episode?episode_id=41924`,
    },
    {
      id: 'popular',
      title: 'Популярные аниме',
      method: 'GET',
      path: '/api/popular',
      description: 'Получить популярные аниме отсортированные по рейтингу',
      params: [
        { name: 'limit', type: 'number', required: false, description: 'Количество результатов (10-60, default: 20)' },
        { name: 'page', type: 'number', required: false, description: 'Номер страницы' },
        { name: 'type', type: 'number', required: false, description: 'Тип: 16=TV, 17=Фильм, 18=OVA, 19=ONA, 21=Спешл' },
        { name: 'status', type: 'number', required: false, description: 'Статус: 1=Онгоинг, 2=Завершён, 3=Анонс' },
        { name: 'year', type: 'number', required: false, description: 'Год выпуска' },
      ],
      example: `${baseUrl}/api/popular?limit=20&type=16`,
    },
    {
      id: 'recent',
      title: 'Недавно обновлённые',
      method: 'GET',
      path: '/api/recent',
      description: 'Получить недавно обновлённые аниме',
      params: [
        { name: 'limit', type: 'number', required: false, description: 'Количество результатов (10-60, default: 20)' },
        { name: 'page', type: 'number', required: false, description: 'Номер страницы' },
        { name: 'type', type: 'number', required: false, description: 'Тип аниме' },
        { name: 'status', type: 'number', required: false, description: 'Статус' },
      ],
      example: `${baseUrl}/api/recent?limit=15&status=1`,
    },
    {
      id: 'filter',
      title: 'Расширенный поиск',
      method: 'GET',
      path: '/api/filter',
      description: 'Расширенный поиск с множественной фильтрацией и сортировкой',
      params: [
        { name: 'q', type: 'string', required: false, description: 'Поисковый запрос' },
        { name: 'limit', type: 'number', required: false, description: 'Количество результатов (10-60)' },
        { name: 'page', type: 'number', required: false, description: 'Номер страницы' },
        { name: 'sort', type: 'string', required: false, description: 'Сортировка: rating, -rating, updated_at, -updated_at, name, -name' },
        { name: 'type', type: 'number', required: false, description: 'Тип аниме' },
        { name: 'year', type: 'number', required: false, description: 'Год выпуска' },
        { name: 'age_rating', type: 'number', required: false, description: 'Возраст: 0=Нет, 1=6+, 2=12+, 3=16+, 4=18+' },
      ],
      example: `${baseUrl}/api/filter?q=naruto&sort=-rating&limit=10`,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4">
            🎌 Anime API
          </h1>
          <p className="text-xl text-gray-200 mb-6">
            Полнофункциональное API для работы с аниме контентом
          </p>
          <div className="flex justify-center gap-4">
            <span className="px-4 py-2 bg-green-500 text-white rounded-full text-sm font-semibold">
              ✓ Прокси изображений
            </span>
            <span className="px-4 py-2 bg-blue-500 text-white rounded-full text-sm font-semibold">
              ✓ Kodik интеграция
            </span>
            <span className="px-4 py-2 bg-purple-500 text-white rounded-full text-sm font-semibold">
              ✓ CORS поддержка
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white/10 backdrop-blur-md rounded-lg p-2 mb-6 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-3 rounded-lg font-semibold transition-all whitespace-nowrap ${
              activeTab === 'overview'
                ? 'bg-white text-purple-900'
                : 'text-white hover:bg-white/20'
            }`}
          >
            📖 Обзор
          </button>
          <button
            onClick={() => setActiveTab('endpoints')}
            className={`px-6 py-3 rounded-lg font-semibold transition-all whitespace-nowrap ${
              activeTab === 'endpoints'
                ? 'bg-white text-purple-900'
                : 'text-white hover:bg-white/20'
            }`}
          >
            🔌 Эндпоинты
          </button>
          <button
            onClick={() => setActiveTab('examples')}
            className={`px-6 py-3 rounded-lg font-semibold transition-all whitespace-nowrap ${
              activeTab === 'examples'
                ? 'bg-white text-purple-900'
                : 'text-white hover:bg-white/20'
            }`}
          >
            💡 Примеры
          </button>
        </div>

        {/* Content */}
        <div className="bg-white/10 backdrop-blur-md rounded-lg p-8">
          {activeTab === 'overview' && (
            <div className="text-white space-y-6">
              <h2 className="text-3xl font-bold mb-4">Обзор API</h2>
              
              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-3">🌐 Базовый URL</h3>
                <code className="block bg-black/30 p-4 rounded text-green-300 font-mono">
                  {baseUrl}
                </code>
              </div>

              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-3">✨ Основные возможности</h3>
                <ul className="space-y-3 ml-6 list-disc">
                  <li>🔍 Поиск аниме по названию</li>
                  <li>📺 Получение информации о тайтлах и эпизодах</li>
                  <li>🎥 Прямые ссылки на видео через Kodik (360p, 480p, 720p)</li>
                  <li>🖼️ Автоматическая замена URL изображений на прокси</li>
                  <li>🔥 Популярные и недавно обновлённые аниме</li>
                  <li>🎯 Расширенная фильтрация и сортировка</li>
                  <li>💾 Кэширование (5 мин API, 1 час изображения)</li>
                  <li>🌍 CORS поддержка для фронтенда</li>
                  <li>🚦 Rate limiting: 100 запросов/минуту</li>
                </ul>
              </div>

              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-3">🎨 Автоматическая замена изображений</h3>
                <p className="mb-3">
                  Все URL изображений автоматически заменяются на прокси URL. Вы получаете готовые к использованию ссылки:
                </p>
                <div className="space-y-2">
                  <div>
                    <p className="text-red-300 text-sm">❌ Оригинальный URL (не работает из-за CORS):</p>
                    <code className="block bg-black/30 p-2 rounded text-xs text-gray-300 font-mono">
                      https://cover.imglib.info/uploads/anime/16133/cover/xxx.jpg
                    </code>
                  </div>
                  <div>
                    <p className="text-green-300 text-sm">✅ Прокси URL (работает везде):</p>
                    <code className="block bg-black/30 p-2 rounded text-xs text-green-300 font-mono">
                      {baseUrl}/api/proxy/uploads/anime/16133/cover/xxx.jpg
                    </code>
                  </div>
                </div>
              </div>

              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-3">📚 Типы аниме</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="bg-white/10 p-3 rounded">
                    <span className="font-semibold">16</span> = TV Сериал
                  </div>
                  <div className="bg-white/10 p-3 rounded">
                    <span className="font-semibold">17</span> = Фильм
                  </div>
                  <div className="bg-white/10 p-3 rounded">
                    <span className="font-semibold">18</span> = OVA
                  </div>
                  <div className="bg-white/10 p-3 rounded">
                    <span className="font-semibold">19</span> = ONA
                  </div>
                  <div className="bg-white/10 p-3 rounded">
                    <span className="font-semibold">21</span> = Спешл
                  </div>
                </div>
              </div>

              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-3">📊 Статусы</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white/10 p-3 rounded">
                    <span className="font-semibold">1</span> = Онгоинг
                  </div>
                  <div className="bg-white/10 p-3 rounded">
                    <span className="font-semibold">2</span> = Завершён
                  </div>
                  <div className="bg-white/10 p-3 rounded">
                    <span className="font-semibold">3</span> = Анонс
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'endpoints' && (
            <div className="space-y-6">
              <h2 className="text-3xl font-bold text-white mb-6">Эндпоинты API</h2>
              {endpoints.map((endpoint) => (
                <div key={endpoint.id} className="bg-white/5 rounded-lg p-6 text-white">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="px-3 py-1 bg-green-500 text-white rounded font-mono text-sm">
                      {endpoint.method}
                    </span>
                    <h3 className="text-xl font-semibold">{endpoint.title}</h3>
                  </div>
                  
                  <code className="block bg-black/30 p-3 rounded text-blue-300 font-mono mb-3 text-sm overflow-x-auto">
                    {endpoint.path}
                  </code>
                  
                  <p className="text-gray-300 mb-4">{endpoint.description}</p>
                  
                  <div className="mb-4">
                    <h4 className="font-semibold mb-2">Параметры:</h4>
                    <div className="space-y-2">
                      {endpoint.params.map((param) => (
                        <div key={param.name} className="bg-black/20 p-3 rounded">
                          <div className="flex items-center gap-2 mb-1">
                            <code className="text-yellow-300 font-mono">{param.name}</code>
                            <span className="text-xs px-2 py-1 bg-purple-500 rounded">{param.type}</span>
                            {param.required && (
                              <span className="text-xs px-2 py-1 bg-red-500 rounded">required</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-300">{param.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">Пример запроса:</h4>
                    <div className="flex gap-2">
                      <code className="flex-1 bg-black/30 p-3 rounded text-green-300 font-mono text-sm overflow-x-auto">
                        {endpoint.example}
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(endpoint.example)}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                      >
                        📋
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'examples' && (
            <div className="text-white space-y-6">
              <h2 className="text-3xl font-bold mb-6">Примеры использования</h2>
              
              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-3">🔍 Полный workflow получения видео</h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-green-300 mb-2">1. Поиск аниме:</p>
                    <code className="block bg-black/30 p-3 rounded font-mono text-sm overflow-x-auto">
                      GET {baseUrl}/api/proxy/anime?q=jujutsu&limit=10
                    </code>
                    <p className="text-sm text-gray-400 mt-2">→ Получаем id и slug_url</p>
                  </div>
                  
                  <div>
                    <p className="text-green-300 mb-2">2. Список эпизодов:</p>
                    <code className="block bg-black/30 p-3 rounded font-mono text-sm overflow-x-auto">
                      GET {baseUrl}/api/proxy/episodes?anime_id=16133&limit=24
                    </code>
                    <p className="text-sm text-gray-400 mt-2">→ Получаем episode_id первого эпизода</p>
                  </div>
                  
                  <div>
                    <p className="text-green-300 mb-2">3. Детали эпизода:</p>
                    <code className="block bg-black/30 p-3 rounded font-mono text-sm overflow-x-auto">
                      GET {baseUrl}/api/proxy/episodes/41924
                    </code>
                    <p className="text-sm text-gray-400 mt-2">→ Получаем список озвучек с Kodik ссылками</p>
                  </div>
                  
                  <div>
                    <p className="text-green-300 mb-2">4. Прямые видео-ссылки:</p>
                    <code className="block bg-black/30 p-3 rounded font-mono text-sm overflow-x-auto">
                      GET {baseUrl}/api/kodik/episode?episode_id=41924
                    </code>
                    <p className="text-sm text-gray-400 mt-2">→ Получаем прямые ссылки на видео в 360p, 480p, 720p</p>
                  </div>
                </div>
              </div>

              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-3">⚛️ Пример на JavaScript</h3>
                <pre className="bg-black/30 p-4 rounded overflow-x-auto">
                  <code className="text-sm text-green-300">{`// Поиск аниме
const response = await fetch(
  '${baseUrl}/api/proxy/anime?q=naruto&limit=10'
);
const data = await response.json();

// Обложка уже с прокси URL - можно использовать напрямую!
const coverUrl = data.data[0].cover.default;

// Получение эпизодов
const episodesResponse = await fetch(
  \`${baseUrl}/api/proxy/episodes?anime_id=\${data.data[0].id}\`
);
const episodes = await episodesResponse.json();

// Получение прямых видео-ссылок
const videoResponse = await fetch(
  \`${baseUrl}/api/kodik/episode?episode_id=\${episodes.data[0].id}\`
);
const videoLinks = await videoResponse.json();

// videoLinks.kodik_links[0].directLinks содержит ссылки на видео
console.log(videoLinks.kodik_links[0].directLinks);
// { 360: [...], 480: [...], 720: [...] }`}</code>
                </pre>
              </div>

              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-3">🚀 Полезные сценарии</h3>
                <div className="space-y-3">
                  <div className="bg-black/20 p-4 rounded">
                    <p className="font-semibold mb-2">🔥 Топ популярных TV сериалов:</p>
                    <code className="text-sm text-blue-300">/api/popular?type=16&limit=20</code>
                  </div>
                  <div className="bg-black/20 p-4 rounded">
                    <p className="font-semibold mb-2">⏰ Недавние онгоинги:</p>
                    <code className="text-sm text-blue-300">/api/recent?status=1&limit=15</code>
                  </div>
                  <div className="bg-black/20 p-4 rounded">
                    <p className="font-semibold mb-2">🎬 Лучшие фильмы 2023 года:</p>
                    <code className="text-sm text-blue-300">/api/filter?type=17&year=2023&sort=-rating</code>
                  </div>
                  <div className="bg-black/20 p-4 rounded">
                    <p className="font-semibold mb-2">🔍 Поиск с сортировкой:</p>
                    <code className="text-sm text-blue-300">/api/filter?q=demon&sort=-rating&limit=20</code>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-white/60 text-sm">
          <p>Made with ❤️ for anime lovers</p>
          <p className="mt-2">Данные предоставлены api.cdnlibs.org | Видео через Kodik</p>
        </div>
      </div>
    </div>
  );
}
