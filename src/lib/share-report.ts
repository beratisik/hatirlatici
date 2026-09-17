import { Share } from 'react-native';

export async function shareReportCard(message: string, title = 'Mezuniyet Karnesi'): Promise<void> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    await navigator.share({ title, text: message });
    return;
  }

  await Share.share({ message, title });
}
