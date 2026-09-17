import type { Rank } from '@/context/GoalContext';

const RANK_COPY: Record<string, { title: string; body: string }> = {
  BAHANECİ: {
    title: 'Yine mi bahane?',
    body: 'Hedeflerin yerinde duruyor. Bugün birini bitirmezsen skorun da yerinde sayacak.',
  },
  'TATLI SU PLANLAYICISI': {
    title: 'Canın isteyince değil, şimdi.',
    body: 'Planın var ama uygulama yok. Bir hedefi kapat, rütbeni hak et.',
  },
  'İRADE ÇIRAĞI': {
    title: 'Zinciri kırma.',
    body: 'İstikrar başladı. Bugün de bir görev tamamla, çıraklık burada biter.',
  },
  'ODAK CANAVARI': {
    title: 'İvmeyi kaybetme.',
    body: 'Bahaneleri bıraktın. Bugünün hedefini de zamanında kapat.',
  },
  'DEMİR İRADE': {
    title: 'Makineler uyumaz.',
    body: 'Rütben ağır. Standartını düşürme; sıradaki hedef seni bekliyor.',
  },
};

const FALLBACK_COPY = {
  title: 'Hedeflerin bekliyor.',
  body: 'Ertelemeyi bırak. Bir görevi bugün bitir.',
};

export function getRankNotificationContent(rank: Rank): { title: string; body: string } {
  return RANK_COPY[rank.title] ?? FALLBACK_COPY;
}
