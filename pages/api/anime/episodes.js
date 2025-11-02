// pages/api/anime/episodes.js
export default async function handler(req, res) {
  const { episode_id } = req.query;
  
  try {
    // Получаем данные эпизода с сервера
    const episodeResponse = await fetch(`https://animelib-api.vercel.app/api/kodik/episode?episode_id=${episode_id}`);
    const episodeData = await episodeResponse.json();
    
    // Отдаём данные эпизода на клиент - пусть он сам получает ссылки
    res.status(200).json({
      success: true,
      episode_id,
      kodikPlayers: episodeData.data?.players?.filter(p => p.player === 'Kodik') || []
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
