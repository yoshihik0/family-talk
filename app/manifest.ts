import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: '家族のおしゃべり',
    short_name: '実家のおしゃべり',
    description: '家族の会話だけに集中できる、シンプルな家族専用メッセンジャー',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4f8f5',
    theme_color: '#2f6b4f',
    lang: 'ja',
    orientation: 'portrait-primary',
  };
}
